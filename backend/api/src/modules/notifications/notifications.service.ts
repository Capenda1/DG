import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { normalizeAngolaPhoneToE164 } from '../../common/angola-phone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { buildOrderFinishedSmsBody } from './order-finished-sms.template';
import type {
  SmsNotificationHistoryItem,
  SmsNotificationHistoryResponse,
} from './notifications.types';
import { TwilioSmsService } from './twilio-sms.service';

const ORDER_FINISHED_KIND = 'ORDER_FINISHED';

function metaString(metadata: unknown, key: string): string | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function metaBoolean(metadata: unknown, key: string): boolean {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>)[key] === true;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioSmsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Envia SMS ao cliente quando o pedido passa a FINISHED (pronto para recolha).
   * Não propaga erro — falhas ficam registadas em `notifications`.
   */
  async notifyOrderFinished(params: {
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientPhone: string | null;
    sentById: string;
  }): Promise<void> {
    if (!(await this.twilio.isEnabled())) {
      const status = await this.twilio.getStatus();
      this.logger.debug(
        `SMS pedido finalizado ignorado (${params.orderNumber}): Twilio inactivo — em falta: ${status.missing.join(', ') || 'n/d'}.`,
      );
      return;
    }

    const toE164 = normalizeAngolaPhoneToE164(params.clientPhone);
    if (!toE164) {
      this.logger.warn(
        `Pedido ${params.orderNumber}: cliente sem telefone angolano válido — SMS não enviado.`,
      );
      await this.recordSkippedNotification(params, 'Telefone inválido ou em falta');
      return;
    }

    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        orderId: params.orderId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.SENT,
        metadata: { path: ['kind'], equals: ORDER_FINISHED_KIND },
      },
      select: { id: true },
    });
    if (alreadySent) {
      this.logger.debug(
        `SMS pedido finalizado já enviado para ${params.orderNumber}.`,
      );
      return;
    }

    const [business, payment, twilioRuntime] = await Promise.all([
      this.settings.getBusinessProfile(),
      this.settings.getPaymentSettings(),
      this.settings.resolveTwilioSmsRuntimeConfig(),
    ]);
    const businessPhone =
      business.phone?.trim() || payment.whatsappNumber?.trim() || '';

    const body = buildOrderFinishedSmsBody({
      orderNumber: params.orderNumber,
      clientName: params.clientName,
      businessPhone,
      appName: business.companyName?.trim() || 'Gráfica Dádiva',
      messageTemplate: twilioRuntime?.messageTemplate,
      oneWayFooter: twilioRuntime?.oneWayFooter,
    });

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: params.clientId,
        orderId: params.orderId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.PENDING,
        title: 'Pedido finalizado',
        body,
        sentById: params.sentById,
        metadata: {
          kind: ORDER_FINISHED_KIND,
          to: toE164,
          provider: 'twilio',
        } satisfies Prisma.InputJsonObject,
      },
    });

    try {
      const { sid } = await this.twilio.sendSms(toE164, body);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          metadata: {
            kind: ORDER_FINISHED_KIND,
            to: toE164,
            provider: 'twilio',
            twilioSid: sid,
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Falha SMS Twilio (pedido ${params.orderNumber}): ${message}`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: {
            kind: ORDER_FINISHED_KIND,
            to: toE164,
            provider: 'twilio',
            error: message.slice(0, 500),
          } satisfies Prisma.InputJsonObject,
        },
      });
    }
  }

  private async recordSkippedNotification(
    params: {
      orderId: string;
      orderNumber: string;
      clientId: string;
      sentById: string;
    },
    reason: string,
  ): Promise<void> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        orderId: params.orderId,
        channel: NotificationChannel.SMS,
        metadata: { path: ['kind'], equals: ORDER_FINISHED_KIND },
      },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.notification.create({
      data: {
        recipientId: params.clientId,
        orderId: params.orderId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.FAILED,
        title: 'Pedido finalizado',
        body: `Pedido ${params.orderNumber} finalizado (SMS não enviado).`,
        sentById: params.sentById,
        metadata: {
          kind: ORDER_FINISHED_KIND,
          skipped: true,
          reason,
        } satisfies Prisma.InputJsonObject,
      },
    });
  }

  async listSmsHistory(opts: {
    take?: number;
    skip?: number;
    status?: NotificationStatus;
    search?: string;
    orderId?: string;
  }): Promise<SmsNotificationHistoryResponse> {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
    const skip = Math.max(opts.skip ?? 0, 0);

    const baseWhere: Prisma.NotificationWhereInput = {
      channel: NotificationChannel.SMS,
      metadata: { path: ['kind'], equals: ORDER_FINISHED_KIND },
    };

    const where: Prisma.NotificationWhereInput = { ...baseWhere };
    if (opts.status) where.status = opts.status;
    if (opts.orderId) where.orderId = opts.orderId;

    const q = opts.search?.trim();
    if (q) {
      where.AND = [
        {
          OR: [
            { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
            { recipient: { name: { contains: q, mode: 'insensitive' } } },
            { body: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [rows, total, grouped] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          recipient: { select: { id: true, name: true, phone: true } },
          order: { select: { id: true, orderNumber: true, status: true } },
          sentBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const summary = {
      sent: 0,
      failed: 0,
      pending: 0,
      read: 0,
    };
    for (const row of grouped) {
      if (row.status === NotificationStatus.SENT) summary.sent = row._count._all;
      if (row.status === NotificationStatus.FAILED) summary.failed = row._count._all;
      if (row.status === NotificationStatus.PENDING) summary.pending = row._count._all;
      if (row.status === NotificationStatus.READ) summary.read = row._count._all;
    }

    const items: SmsNotificationHistoryItem[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      orderId: row.orderId,
      orderNumber: row.order?.orderNumber ?? null,
      orderStatus: row.order?.status ?? null,
      recipientId: row.recipient.id,
      recipientName: row.recipient.name,
      recipientPhone: row.recipient.phone,
      sentByName: row.sentBy?.name ?? null,
      to: metaString(row.metadata, 'to'),
      twilioSid: metaString(row.metadata, 'twilioSid'),
      error: metaString(row.metadata, 'error') ?? metaString(row.metadata, 'reason'),
      skipped: metaBoolean(row.metadata, 'skipped'),
      skipReason: metaString(row.metadata, 'reason'),
    }));

    return { items, total, summary };
  }

  async deleteSmsHistory(ids: string[]): Promise<{ deleted: number }> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return { deleted: 0 };
    }

    const result = await this.prisma.notification.deleteMany({
      where: {
        id: { in: unique },
        channel: NotificationChannel.SMS,
        metadata: { path: ['kind'], equals: ORDER_FINISHED_KIND },
      },
    });

    return { deleted: result.count };
  }
}
