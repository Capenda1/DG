import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderOrigin, OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(
    orderId: string,
    user: { id: string; role: UserRole },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        designerId: true,
        status: true,
        orderOrigin: true,
        draftSharedWithDesignTeam: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (user.role === UserRole.CLIENT && order.clientId !== user.id) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }
    if (user.role === UserRole.DESIGNER) {
      /** Alinhado a `OrdersService.findOneForUser` — mensagens devem seguir a mesma visibilidade. */
      const assignedToMe = order.designerId === user.id;
      const unassignedInQueue =
        order.designerId === null &&
        (order.status === OrderStatus.SUBMITTED ||
          order.status === OrderStatus.VALIDATION_PAYMENT);
      const unassignedBalcaoDraftShared =
        order.designerId === null &&
        order.status === OrderStatus.DRAFT &&
        order.orderOrigin === OrderOrigin.BALCAO &&
        order.draftSharedWithDesignTeam;
      const openForDelivery = order.status === OrderStatus.FINISHED;
      if (
        !assignedToMe &&
        !unassignedInQueue &&
        !unassignedBalcaoDraftShared &&
        !openForDelivery
      ) {
        throw new ForbiddenException('Sem acesso a este pedido.');
      }
    }
    return order;
  }

  async listMessages(
    orderId: string,
    user: { id: string; role: UserRole },
    since?: string,
  ) {
    await this.assertAccess(orderId, user);
    return this.prisma.message.findMany({
      where: {
        orderId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async sendMessage(
    orderId: string,
    content: string,
    user: { id: string; role: UserRole },
  ) {
    await this.assertAccess(orderId, user);
    return this.prisma.message.create({
      data: { orderId, senderId: user.id, content: content.trim() },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async markRead(orderId: string, user: { id: string; role: UserRole }) {
    await this.assertAccess(orderId, user);
    /* Marca como lidas apenas as mensagens que NÃO foram enviadas pelo próprio utilizador */
    await this.prisma.message.updateMany({
      where: {
        orderId,
        senderId: { not: user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async unreadCount(
    orderId: string,
    user: { id: string; role: UserRole },
  ): Promise<number> {
    await this.assertAccess(orderId, user);
    return this.prisma.message.count({
      where: { orderId, senderId: { not: user.id }, readAt: null },
    });
  }

  /** Contagens em lote — 1 pedido HTTP em vez de N (evita 429 com listas grandes). */
  async unreadCountsBatch(
    orderIds: string[],
    user: { id: string; role: UserRole },
  ): Promise<Record<string, number>> {
    const unique = [
      ...new Set(
        orderIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ].slice(0, 250);

    const out: Record<string, number> = {};
    for (const id of unique) out[id] = 0;
    if (unique.length === 0) return out;

    const accessible = await this.filterAccessibleOrderIds(unique, user);
    if (accessible.length === 0) return out;

    const grouped = await this.prisma.message.groupBy({
      by: ['orderId'],
      where: {
        orderId: { in: accessible },
        senderId: { not: user.id },
        readAt: null,
      },
      _count: { _all: true },
    });

    for (const row of grouped) {
      out[row.orderId] = row._count._all;
    }
    return out;
  }

  private async filterAccessibleOrderIds(
    orderIds: string[],
    user: { id: string; role: UserRole },
  ): Promise<string[]> {
    if (user.role === UserRole.CLIENT) {
      const rows = await this.prisma.order.findMany({
        where: { id: { in: orderIds }, clientId: user.id },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    if (user.role === UserRole.DESIGNER) {
      const rows = await this.prisma.order.findMany({
        where: {
          id: { in: orderIds },
          OR: [
            { designerId: user.id },
            {
              designerId: null,
              status: {
                in: [OrderStatus.SUBMITTED, OrderStatus.VALIDATION_PAYMENT],
              },
            },
            {
              designerId: null,
              status: OrderStatus.DRAFT,
              orderOrigin: OrderOrigin.BALCAO,
              draftSharedWithDesignTeam: true,
            },
            { status: OrderStatus.FINISHED },
          ],
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    const rows = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
