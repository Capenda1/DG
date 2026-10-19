import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import {
  formatAngolaPhoneForDisplay,
  normalizeAngolaPhoneToE164,
} from '../../common/angola-phone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { buildOrderFinishedSmsBody } from './order-finished-sms.template';
import type {
  OrderCustomerNotificationItem,
  OrderCustomerNotificationsResponse,
  OrderCustomerNotifyChannel,
  OrderCustomerNotifyResult,
  SmsNotificationHistoryItem,
  SmsNotificationHistoryResponse,
} from './notifications.types';
import { TwilioSmsService } from './twilio-sms.service';

/** Legado: SMS automático ao finalizar (desactivado). */
const ORDER_FINISHED_KIND = 'ORDER_FINISHED';
/** Avisos manuais SMS / email / WhatsApp a partir do pedido. */
const ORDER_CUSTOMER_NOTIFY_KIND = 'ORDER_CUSTOMER_NOTIFY';

const SMS_HISTORY_KINDS = [ORDER_FINISHED_KIND, ORDER_CUSTOMER_NOTIFY_KIND];

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

function channelEnum(
  channel: OrderCustomerNotifyChannel,
): NotificationChannel {
  if (channel === 'SMS') return NotificationChannel.SMS;
  if (channel === 'EMAIL') return NotificationChannel.EMAIL;
  return NotificationChannel.WHATSAPP;
}

function buildWhatsAppUrl(e164: string, body: string): string {
  const digits = e164.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilio: TwilioSmsService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  /**
   * SMS automático quando o pedido passa a FINISHED — só se sendMode = automatic.
   * Falhas ficam registadas; não propaga erro.
   */
  async notifyOrderFinished(params: {
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientPhone: string | null;
    sentById: string;
  }): Promise<void> {
    const runtime = await this.settings.resolveTwilioSmsRuntimeConfig();
    if (runtime?.sendMode !== 'automatic') {
      this.logger.debug(
        `SMS automático ignorado (${params.orderNumber}): modo ${runtime?.sendMode ?? 'manual'}.`,
      );
      return;
    }

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
      await this.recordSkippedNotification(
        params,
        'Telefone inválido ou em falta',
      );
      return;
    }

    const alreadySent = await this.findSentSmsForOrder(params.orderId);
    if (alreadySent) {
      this.logger.debug(
        `SMS pedido finalizado já enviado para ${params.orderNumber}.`,
      );
      return;
    }

    const ctx = await this.resolveBusinessContext();
    const body = buildOrderFinishedSmsBody({
      orderNumber: params.orderNumber,
      clientName: params.clientName,
      businessPhone: ctx.businessPhone,
      appName: ctx.appName,
      messageTemplate: ctx.messageTemplate,
      oneWayFooter: ctx.oneWayFooter,
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
          sendMode: 'automatic',
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
            sendMode: 'automatic',
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
            sendMode: 'automatic',
          } satisfies Prisma.InputJsonObject,
        },
      });
    }
  }

  private smsKindWhere(): Prisma.NotificationWhereInput['OR'] {
    return SMS_HISTORY_KINDS.map((kind) => ({
      metadata: { path: ['kind'], equals: kind },
    }));
  }

  private async findSentSmsForOrder(orderId: string) {
    return this.prisma.notification.findFirst({
      where: {
        orderId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.SENT,
        OR: this.smsKindWhere(),
      },
      select: { id: true },
    });
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
        OR: this.smsKindWhere(),
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
          sendMode: 'automatic',
        } satisfies Prisma.InputJsonObject,
      },
    });
  }

  async getOrderCustomerNotifyContext(
    orderId: string,
  ): Promise<OrderCustomerNotificationsResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const phoneE164 = normalizeAngolaPhoneToE164(order.client.phone);
    const email = order.client.email?.trim() || null;
    const [twilioStatus, mailOn, smsPublic] = await Promise.all([
      this.twilio.getStatus(),
      this.mail.isConfigured(),
      this.settings.getTwilioSmsSettingsPublic(),
    ]);
    const twilioOn = twilioStatus.enabled;

    const rows = await this.prisma.notification.findMany({
      where: {
        orderId,
        channel: {
          in: [
            NotificationChannel.SMS,
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
          ],
        },
        OR: [
          {
            metadata: {
              path: ['kind'],
              equals: ORDER_CUSTOMER_NOTIFY_KIND,
            },
          },
          {
            metadata: { path: ['kind'], equals: ORDER_FINISHED_KIND },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        sentBy: { select: { id: true, name: true } },
      },
    });

    const items = rows.map((row) => this.mapOrderNotifyItem(row));
    const lastByChannel = {
      SMS: items.find((i) => i.channel === NotificationChannel.SMS) ?? null,
      EMAIL: items.find((i) => i.channel === NotificationChannel.EMAIL) ?? null,
      WHATSAPP:
        items.find((i) => i.channel === NotificationChannel.WHATSAPP) ?? null,
    };

    return {
      items,
      lastByChannel,
      contacts: {
        phone: order.client.phone,
        phoneE164,
        email,
        name: order.client.name,
      },
      channelsReady: {
        SMS: Boolean(twilioOn && phoneE164),
        EMAIL: Boolean(mailOn && email),
        WHATSAPP: Boolean(phoneE164),
      },
      smsSendMode: smsPublic.sendMode,
      smsInactiveReason: twilioOn
        ? null
        : twilioStatus.missing[0] ?? 'Twilio inactivo',
      emailInactiveReason: mailOn
        ? null
        : 'SMTP inactivo — activa em Configurações → Email e guarda utilizador/palavra-passe',
    };
  }

  /**
   * Envio manual a partir do pedido: SMS (Twilio), email (SMTP) ou link WhatsApp.
   */
  async notifyOrderCustomer(params: {
    orderId: string;
    channel: OrderCustomerNotifyChannel;
    sentById: string;
    confirmResend?: boolean;
  }): Promise<OrderCustomerNotifyResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        orderNumber: true,
        clientId: true,
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const channel = channelEnum(params.channel);
    await this.assertResendAllowed({
      orderId: order.id,
      channel,
      confirmResend: params.confirmResend === true,
    });

    if (params.channel === 'SMS') {
      return this.sendManualSms({
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientId: order.clientId,
        clientName: order.client.name,
        clientPhone: order.client.phone,
        sentById: params.sentById,
      });
    }

    if (params.channel === 'EMAIL') {
      return this.sendManualEmail({
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientId: order.clientId,
        clientName: order.client.name,
        clientEmail: order.client.email,
        sentById: params.sentById,
      });
    }

    return this.openManualWhatsApp({
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: order.clientId,
      clientName: order.client.name,
      clientPhone: order.client.phone,
      sentById: params.sentById,
    });
  }

  private async assertResendAllowed(params: {
    orderId: string;
    channel: NotificationChannel;
    confirmResend: boolean;
  }): Promise<void> {
    if (params.confirmResend) return;

    const alreadySent =
      params.channel === NotificationChannel.SMS
        ? await this.findSentSmsForOrder(params.orderId)
        : await this.prisma.notification.findFirst({
            where: {
              orderId: params.orderId,
              channel: params.channel,
              status: NotificationStatus.SENT,
              metadata: {
                path: ['kind'],
                equals: ORDER_CUSTOMER_NOTIFY_KIND,
              },
            },
            select: { id: true },
          });
    if (alreadySent) {
      throw new ConflictException(
        'Já existe um aviso enviado neste canal para este pedido. Confirme para reenviar.',
      );
    }
  }

  private async resolveBusinessContext(): Promise<{
    businessPhone: string;
    appName: string;
    messageTemplate?: string;
    oneWayFooter?: string;
  }> {
    const [business, payment, twilioRuntime] = await Promise.all([
      this.settings.getBusinessProfile(),
      this.settings.getPaymentSettings(),
      this.settings.resolveTwilioSmsRuntimeConfig(),
    ]);
    const businessPhone =
      business.phone?.trim() || payment.whatsappNumber?.trim() || '';
    return {
      businessPhone,
      appName: business.companyName?.trim() || 'Gráfica Dádiva',
      messageTemplate: twilioRuntime?.messageTemplate,
      oneWayFooter: twilioRuntime?.oneWayFooter,
    };
  }

  private async sendManualSms(params: {
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientPhone: string | null;
    sentById: string;
  }): Promise<OrderCustomerNotifyResult> {
    if (!(await this.twilio.isEnabled())) {
      throw new BadRequestException(
        'Twilio SMS está inactivo. Configure em Admin → Notificações.',
      );
    }

    const toE164 = normalizeAngolaPhoneToE164(params.clientPhone);
    if (!toE164) {
      throw new BadRequestException(
        'Cliente sem telefone angolano válido — SMS não enviado.',
      );
    }

    const ctx = await this.resolveBusinessContext();
    const body = buildOrderFinishedSmsBody({
      orderNumber: params.orderNumber,
      clientName: params.clientName,
      businessPhone: ctx.businessPhone,
      appName: ctx.appName,
      messageTemplate: ctx.messageTemplate,
      oneWayFooter: ctx.oneWayFooter,
    });

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: params.clientId,
        orderId: params.orderId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.PENDING,
        title: 'Aviso ao cliente (SMS)',
        body,
        sentById: params.sentById,
        metadata: {
          kind: ORDER_CUSTOMER_NOTIFY_KIND,
          to: toE164,
          provider: 'twilio',
          manual: true,
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
            kind: ORDER_CUSTOMER_NOTIFY_KIND,
            to: toE164,
            provider: 'twilio',
            twilioSid: sid,
            manual: true,
          } satisfies Prisma.InputJsonObject,
        },
      });
      return {
        channel: 'SMS',
        status: NotificationStatus.SENT,
        notificationId: notification.id,
        body,
        to: toE164,
        twilioSid: sid,
      };
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
            kind: ORDER_CUSTOMER_NOTIFY_KIND,
            to: toE164,
            provider: 'twilio',
            error: message.slice(0, 500),
            manual: true,
          } satisfies Prisma.InputJsonObject,
        },
      });
      throw new BadRequestException(`Falha ao enviar SMS: ${message}`);
    }
  }

  private async sendManualEmail(params: {
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientEmail: string | null;
    sentById: string;
  }): Promise<OrderCustomerNotifyResult> {
    if (!(await this.mail.isConfigured())) {
      throw new BadRequestException(
        'Email (SMTP) não está configurado. Configure em Admin → Configurações → Email.',
      );
    }

    const to = params.clientEmail?.trim();
    if (!to) {
      throw new BadRequestException('Cliente sem email — aviso não enviado.');
    }

    const ctx = await this.resolveBusinessContext();
    const contactDisplay =
      formatAngolaPhoneForDisplay(ctx.businessPhone) ??
      (ctx.businessPhone.trim() || undefined);
    const bodyPreview = [
      `${params.clientName}, o pedido ${params.orderNumber} está finalizado e pronto para recolha.`,
      contactDisplay ? `Contacto: ${contactDisplay}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: params.clientId,
        orderId: params.orderId,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.PENDING,
        title: 'Aviso ao cliente (email)',
        body: bodyPreview,
        sentById: params.sentById,
        metadata: {
          kind: ORDER_CUSTOMER_NOTIFY_KIND,
          to,
          provider: 'smtp',
          manual: true,
        } satisfies Prisma.InputJsonObject,
      },
    });

    try {
      await this.mail.sendOrderCustomerNotifyEmail({
        to,
        recipientName: params.clientName,
        orderNumber: params.orderNumber,
        businessPhone: contactDisplay,
        appName: ctx.appName,
      });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          metadata: {
            kind: ORDER_CUSTOMER_NOTIFY_KIND,
            to,
            provider: 'smtp',
            manual: true,
          } satisfies Prisma.InputJsonObject,
        },
      });
      return {
        channel: 'EMAIL',
        status: NotificationStatus.SENT,
        notificationId: notification.id,
        body: bodyPreview,
        to,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Falha email (pedido ${params.orderNumber}): ${message}`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: {
            kind: ORDER_CUSTOMER_NOTIFY_KIND,
            to,
            provider: 'smtp',
            error: message.slice(0, 500),
            manual: true,
          } satisfies Prisma.InputJsonObject,
        },
      });
      throw new BadRequestException(`Falha ao enviar email: ${message}`);
    }
  }

  private async openManualWhatsApp(params: {
    orderId: string;
    orderNumber: string;
    clientId: string;
    clientName: string;
    clientPhone: string | null;
    sentById: string;
  }): Promise<OrderCustomerNotifyResult> {
    const toE164 = normalizeAngolaPhoneToE164(params.clientPhone);
    if (!toE164) {
      throw new BadRequestException(
        'Cliente sem telefone angolano válido — WhatsApp indisponível.',
      );
    }

    const ctx = await this.resolveBusinessContext();
    const body = buildOrderFinishedSmsBody({
      orderNumber: params.orderNumber,
      clientName: params.clientName,
      businessPhone: ctx.businessPhone,
      appName: ctx.appName,
      messageTemplate: ctx.messageTemplate,
      oneWayFooter: '',
    });
    const whatsappUrl = buildWhatsAppUrl(toE164, body);

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: params.clientId,
        orderId: params.orderId,
        channel: NotificationChannel.WHATSAPP,
        status: NotificationStatus.SENT,
        title: 'Aviso ao cliente (WhatsApp)',
        body,
        sentById: params.sentById,
        sentAt: new Date(),
        metadata: {
          kind: ORDER_CUSTOMER_NOTIFY_KIND,
          to: toE164,
          provider: 'whatsapp_link',
          whatsappUrl,
          manual: true,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      channel: 'WHATSAPP',
      status: NotificationStatus.SENT,
      notificationId: notification.id,
      body,
      to: toE164,
      whatsappUrl,
    };
  }

  private mapOrderNotifyItem(row: {
    id: string;
    channel: NotificationChannel;
    status: NotificationStatus;
    title: string;
    body: string;
    createdAt: Date;
    sentAt: Date | null;
    metadata: unknown;
    sentBy: { id: string; name: string } | null;
  }): OrderCustomerNotificationItem {
    return {
      id: row.id,
      channel: row.channel,
      status: row.status,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      sentByName: row.sentBy?.name ?? null,
      to: metaString(row.metadata, 'to'),
      twilioSid: metaString(row.metadata, 'twilioSid'),
      error:
        metaString(row.metadata, 'error') ?? metaString(row.metadata, 'reason'),
      whatsappUrl: metaString(row.metadata, 'whatsappUrl'),
      manual: metaBoolean(row.metadata, 'manual'),
    };
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
      OR: SMS_HISTORY_KINDS.map((kind) => ({
        metadata: { path: ['kind'], equals: kind },
      })),
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
      if (row.status === NotificationStatus.FAILED)
        summary.failed = row._count._all;
      if (row.status === NotificationStatus.PENDING)
        summary.pending = row._count._all;
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
      error:
        metaString(row.metadata, 'error') ?? metaString(row.metadata, 'reason'),
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
        OR: SMS_HISTORY_KINDS.map((kind) => ({
          metadata: { path: ['kind'], equals: kind },
        })),
      },
    });

    return { deleted: result.count };
  }
}
