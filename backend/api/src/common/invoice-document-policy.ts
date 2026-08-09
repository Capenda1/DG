import {
  InvoiceDocumentModel,
  OrderOrigin,
  OrderStatus,
  PaymentMethod,
} from '@prisma/client';

export type InvoiceDocumentContext = {
  status?: string | null;
  paymentMethod?: PaymentMethod | null;
  orderOrigin?: OrderOrigin | null;
};

export type InvoiceDocumentValidation = {
  ok: boolean;
  error?: string;
  warning?: string;
  suggestedModel: InvoiceDocumentModel;
};

const POST_PAYMENT_STATUSES = new Set<string>([
  OrderStatus.VALIDATION_PAYMENT,
  OrderStatus.APPROVED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.FINISHED,
  OrderStatus.DELIVERED,
]);

function orderIsPreSubmission(status: string | null | undefined): boolean {
  return String(status ?? OrderStatus.DRAFT).toUpperCase() === OrderStatus.DRAFT;
}

export function proFormaOmitsOrderStatus(
  status: string | null | undefined,
): boolean {
  return orderIsPreSubmission(status);
}

export function isBankTransferPaymentMethod(
  pm: PaymentMethod | null | undefined,
): boolean {
  return (
    pm === PaymentMethod.BANK_TRANSFER_SAME ||
    pm === PaymentMethod.DEPOSIT ||
    pm === PaymentMethod.BANK_TRANSFER_EXPRESS
  );
}

export function isImmediatePdvPaymentMethod(
  pm: PaymentMethod | null | undefined,
): boolean {
  return (
    pm === PaymentMethod.PDV_CASH ||
    pm === PaymentMethod.PDV_DEBIT_CARD ||
    pm === PaymentMethod.PDV_CREDIT_CARD
  );
}

function isBalcaoOrder(origin: OrderOrigin | null | undefined): boolean {
  return origin === OrderOrigin.BALCAO;
}

export function invoiceDocumentContextFromOrder(order: {
  status?: OrderStatus | string | null;
  paymentMethod?: PaymentMethod | null;
  orderOrigin?: OrderOrigin | null;
}): InvoiceDocumentContext {
  return {
    status: order.status ?? OrderStatus.DRAFT,
    paymentMethod: order.paymentMethod ?? null,
    orderOrigin: order.orderOrigin ?? null,
  };
}

export function suggestInvoiceDocumentModel(
  ctx: InvoiceDocumentContext,
): InvoiceDocumentModel {
  const status = String(ctx.status ?? OrderStatus.DRAFT).toUpperCase();
  const pm = ctx.paymentMethod ?? null;
  const balcao = isBalcaoOrder(ctx.orderOrigin);

  if (status === OrderStatus.CANCELLED) {
    return InvoiceDocumentModel.FACTURA_POR_FORMA;
  }

  if (orderIsPreSubmission(status)) {
    if (balcao && isImmediatePdvPaymentMethod(pm)) {
      return InvoiceDocumentModel.FACTURA_RECIBO;
    }
    return InvoiceDocumentModel.FACTURA_POR_FORMA;
  }

  if (
    isBankTransferPaymentMethod(pm) &&
    (status === OrderStatus.SUBMITTED ||
      status === OrderStatus.VALIDATION_PAYMENT)
  ) {
    return InvoiceDocumentModel.FACTURA_POR_FORMA;
  }

  if (POST_PAYMENT_STATUSES.has(status) || isImmediatePdvPaymentMethod(pm)) {
    return InvoiceDocumentModel.FACTURA_RECIBO;
  }

  if (status === OrderStatus.SUBMITTED && balcao) {
    return InvoiceDocumentModel.FACTURA_RECIBO;
  }

  return InvoiceDocumentModel.FACTURA_RECIBO;
}

export function validateInvoiceDocumentModel(
  ctx: InvoiceDocumentContext,
  model: InvoiceDocumentModel,
): InvoiceDocumentValidation {
  const suggested = suggestInvoiceDocumentModel(ctx);
  const status = String(ctx.status ?? OrderStatus.DRAFT).toUpperCase();
  const pm = ctx.paymentMethod ?? null;
  const balcao = isBalcaoOrder(ctx.orderOrigin);

  if (status === OrderStatus.CANCELLED) {
    return {
      ok: false,
      error: 'Pedido cancelado — não é possível emitir documentos.',
      suggestedModel: suggested,
    };
  }

  if (model === InvoiceDocumentModel.FACTURA_POR_FORMA) {
    if (
      POST_PAYMENT_STATUSES.has(status) &&
      (isImmediatePdvPaymentMethod(pm) || pm != null)
    ) {
      return {
        ok: true,
        warning:
          'Pedido já com pagamento: pró-forma é apenas informativa (orçamento).',
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  if (model === InvoiceDocumentModel.FACTURA_RECIBO) {
    if (!pm) {
      return {
        ok: true,
        warning:
          'Indique o método de pagamento no pedido para o comprovativo ficar completo.',
        suggestedModel: suggested,
      };
    }
    if (orderIsPreSubmission(status) && !balcao) {
      return {
        ok: true,
        warning:
          'Pedido online ainda em rascunho — confirme com o cliente antes de imprimir o recibo.',
        suggestedModel: suggested,
      };
    }
    if (
      orderIsPreSubmission(status) &&
      balcao &&
      isBankTransferPaymentMethod(pm)
    ) {
      return {
        ok: true,
        warning:
          'Transferência pendente: considere pró-forma até confirmação do pagamento.',
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  if (model === InvoiceDocumentModel.FACTURA) {
    if (orderIsPreSubmission(status)) {
      return {
        ok: true,
        warning:
          'Pedido ainda em rascunho — a factura oficial ficará fechada após emissão.',
        suggestedModel: suggested,
      };
    }
    if (
      isBankTransferPaymentMethod(pm) &&
      status === OrderStatus.SUBMITTED
    ) {
      return {
        ok: true,
        warning:
          'Pagamento por transferência ainda em validação — confirme o recebimento.',
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  return { ok: true, suggestedModel: suggested };
}

export function documentModelPrefix(model: InvoiceDocumentModel): string {
  switch (model) {
    case InvoiceDocumentModel.FACTURA_POR_FORMA:
      return 'FF';
    case InvoiceDocumentModel.FACTURA_RECIBO:
      return 'FR';
    case InvoiceDocumentModel.FACTURA:
      return 'FT';
  }
}

export function formatDocumentNumber(
  model: InvoiceDocumentModel,
  year: number,
  seq: number,
): string {
  const prefix = documentModelPrefix(model);
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

export function receiptShouldIncludeBankDetails(
  documentModel: InvoiceDocumentModel,
  paymentMethod: PaymentMethod | null | undefined,
): boolean {
  if (
    documentModel === InvoiceDocumentModel.FACTURA_POR_FORMA ||
    documentModel === InvoiceDocumentModel.FACTURA
  ) {
    return true;
  }
  if (
    documentModel === InvoiceDocumentModel.FACTURA_RECIBO &&
    isBankTransferPaymentMethod(paymentMethod)
  ) {
    return true;
  }
  return false;
}
