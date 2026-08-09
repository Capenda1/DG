import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceDocumentModel,
  OrderDocumentIssueAction,
  UserRole,
} from '@prisma/client';
import {
  formatDocumentNumber,
  invoiceDocumentContextFromOrder,
  validateInvoiceDocumentModel,
} from '../../common/invoice-document-policy';
import { PrismaService } from '../../prisma/prisma.service';

export type OrderDocumentIssueResult = {
  id: string;
  orderId: string;
  orderNumber: string;
  documentModel: InvoiceDocumentModel;
  documentNumber: string;
  sequenceYear: number;
  sequenceNum: number;
  action: OrderDocumentIssueAction;
  isReprint: boolean;
  issuedAt: string;
  issuedBy: { id: string; name: string } | null;
};

@Injectable()
export class OrderDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCanAccessOrder(
    orderId: string,
    user: { id: string; role: UserRole },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productionProcess: true } },
        client: { select: { id: true, name: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (user.role === UserRole.CLIENT) {
      if (order.clientId !== user.id) {
        throw new ForbiddenException('Sem permissão para este pedido.');
      }
      throw new ForbiddenException(
        'Recibos e facturas são emitidos na loja pela equipa Dádiva.',
      );
    } else if (user.role === UserRole.DESIGNER) {
      throw new ForbiddenException(
        'Sem permissão para emitir documentos deste pedido.',
      );
    } else if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.ATTENDANT
    ) {
      throw new ForbiddenException('Sem permissão para emitir documentos.');
    }

    return order;
  }

  async issueDocument(
    orderId: string,
    documentModel: InvoiceDocumentModel,
    action: OrderDocumentIssueAction,
    user: { id: string; role: UserRole; name?: string },
  ): Promise<OrderDocumentIssueResult> {
    const order = await this.assertCanAccessOrder(orderId, user);

    const ctx = invoiceDocumentContextFromOrder(order);
    const validation = validateInvoiceDocumentModel(ctx, documentModel);
    if (!validation.ok) {
      throw new BadRequestException(
        validation.error ?? 'Modelo de documento inválido.',
      );
    }

    const year = new Date().getFullYear();

    const result = await this.prisma.$transaction(async (tx) => {
      const prior = await tx.orderDocumentIssue.findFirst({
        where: { orderId, documentModel },
        orderBy: { createdAt: 'asc' },
        include: {
          issuedBy: { select: { id: true, name: true } },
        },
      });

      if (prior) {
        const reissuedAt = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: {
            lastDocumentModel: documentModel,
            lastDocumentNumber: prior.documentNumber,
            lastDocumentIssuedAt: reissuedAt,
          },
        });

        return {
          issue: prior,
          documentNumber: prior.documentNumber,
          sequenceYear: prior.sequenceYear,
          sequenceNum: prior.sequenceNum,
          isReprint: true,
          issuedAt: reissuedAt,
        };
      }

      const seqRow = await tx.orderDocumentSequence.upsert({
        where: {
          year_model: { year, model: documentModel },
        },
        create: { year, model: documentModel, lastSeq: 1 },
        update: { lastSeq: { increment: 1 } },
      });
      const sequenceYear = year;
      const sequenceNum = seqRow.lastSeq;
      const documentNumber = formatDocumentNumber(
        documentModel,
        sequenceYear,
        sequenceNum,
      );

      const issue = await tx.orderDocumentIssue.create({
        data: {
          orderId,
          documentModel,
          documentNumber,
          sequenceYear,
          sequenceNum,
          action,
          issuedById: user.id,
        },
        include: {
          issuedBy: { select: { id: true, name: true } },
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          lastDocumentModel: documentModel,
          lastDocumentNumber: documentNumber,
          lastDocumentIssuedAt: issue.createdAt,
        },
      });

      return {
        issue,
        documentNumber,
        sequenceYear,
        sequenceNum,
        isReprint: false,
        issuedAt: issue.createdAt,
      };
    });

    return {
      id: result.issue.id,
      orderId,
      orderNumber: order.orderNumber,
      documentModel,
      documentNumber: result.documentNumber,
      sequenceYear: result.sequenceYear,
      sequenceNum: result.sequenceNum,
      action,
      isReprint: result.isReprint,
      issuedAt: result.issuedAt.toISOString(),
      issuedBy: result.issue.issuedBy
        ? { id: result.issue.issuedBy.id, name: result.issue.issuedBy.name }
        : null,
    };
  }
}
