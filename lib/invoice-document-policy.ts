import type {
  OrderDocumentIssueAction,
  PaymentMethodValue,
} from "@/lib/api-client";
import type { InvoiceDocumentModel } from "@/lib/payment-receipt-pdf";
import {
  DEFAULT_INVOICE_DOCUMENT_MODEL,
  INVOICE_DOCUMENT_MODEL_LABELS,
} from "@/lib/payment-receipt-pdf";

export type InvoiceDocumentContext = {
  status?: string | null;
  paymentMethod?: PaymentMethodValue | null;
  orderOrigin?: "ONLINE" | "BALCAO" | null;
};

export type InvoiceDocumentValidation = {
  ok: boolean;
  error?: string;
  warning?: string;
  suggestedModel: InvoiceDocumentModel;
};

const PRE_SUBMISSION_STATUSES = new Set(["DRAFT"]);

const POST_PAYMENT_STATUSES = new Set([
  "VALIDATION_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
  "DELIVERED",
]);

export function isBankTransferPaymentMethod(
  pm: PaymentMethodValue | null | undefined,
): boolean {
  return (
    pm === "BANK_TRANSFER_SAME" ||
    pm === "DEPOSIT" ||
    pm === "BANK_TRANSFER_EXPRESS"
  );
}

export function isImmediatePdvPaymentMethod(
  pm: PaymentMethodValue | null | undefined,
): boolean {
  return (
    pm === "PDV_CASH" ||
    pm === "PDV_DEBIT_CARD" ||
    pm === "PDV_CREDIT_CARD"
  );
}

export function isBalcaoOrder(
  origin: InvoiceDocumentContext["orderOrigin"],
): boolean {
  return origin === "BALCAO";
}

export function invoiceDocumentContextFromOrder(order: {
  status?: string | null;
  paymentMethod?: PaymentMethodValue | null;
  orderOrigin?: "ONLINE" | "BALCAO" | null;
}): InvoiceDocumentContext {
  return {
    status: order.status ?? "DRAFT",
    paymentMethod: order.paymentMethod ?? null,
    orderOrigin: order.orderOrigin ?? null,
  };
}

/** Pedido ainda não submetido / entrado no fluxo operacional. */
export function orderIsPreSubmission(
  status: string | null | undefined,
): boolean {
  return PRE_SUBMISSION_STATUSES.has((status ?? "DRAFT").toUpperCase());
}

/** Pro-forma antes da submissão não mostra estado interno (ex.: «Rascunho»). */
export function proFormaOmitsOrderStatus(
  status: string | null | undefined,
): boolean {
  return orderIsPreSubmission(status);
}

/**
 * Modelo sugerido — prática angolana: pró-forma para cotação/transferência;
 * recibo no balcão ou venda paga; factura para arquivo fiscal.
 */
export function suggestInvoiceDocumentModel(
  ctx: InvoiceDocumentContext,
): InvoiceDocumentModel {
  const status = (ctx.status ?? "DRAFT").toUpperCase();
  const pm = ctx.paymentMethod ?? null;
  const balcao = isBalcaoOrder(ctx.orderOrigin);

  if (status === "CANCELLED") {
    return "FACTURA_POR_FORMA";
  }

  if (orderIsPreSubmission(status)) {
    if (balcao && isImmediatePdvPaymentMethod(pm)) {
      return "FACTURA_RECIBO";
    }
    if (balcao && isBankTransferPaymentMethod(pm)) {
      return "FACTURA_POR_FORMA";
    }
    return "FACTURA_POR_FORMA";
  }

  if (
    isBankTransferPaymentMethod(pm) &&
    (status === "SUBMITTED" || status === "VALIDATION_PAYMENT")
  ) {
    return "FACTURA_POR_FORMA";
  }

  if (POST_PAYMENT_STATUSES.has(status) || isImmediatePdvPaymentMethod(pm)) {
    return "FACTURA_RECIBO";
  }

  if (status === "SUBMITTED" && balcao) {
    return "FACTURA_RECIBO";
  }

  return DEFAULT_INVOICE_DOCUMENT_MODEL;
}

/** Valida emissão — erros só em casos inválidos; resto são avisos orientativos. */
export function validateInvoiceDocumentModel(
  ctx: InvoiceDocumentContext,
  model: InvoiceDocumentModel,
): InvoiceDocumentValidation {
  const suggested = suggestInvoiceDocumentModel(ctx);
  const status = (ctx.status ?? "DRAFT").toUpperCase();
  const pm = ctx.paymentMethod ?? null;
  const balcao = isBalcaoOrder(ctx.orderOrigin);

  if (status === "CANCELLED") {
    return {
      ok: false,
      error: "Pedido cancelado — não é possível emitir documentos.",
      suggestedModel: suggested,
    };
  }

  if (model === "FACTURA_POR_FORMA") {
    if (
      POST_PAYMENT_STATUSES.has(status) &&
      (isImmediatePdvPaymentMethod(pm) || pm != null)
    ) {
      return {
        ok: true,
        warning:
          "Pedido já com pagamento: pró-forma é apenas informativa (orçamento).",
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  if (model === "FACTURA_RECIBO") {
    if (!pm) {
      return {
        ok: true,
        warning:
          "Indique o método de pagamento no pedido para o comprovativo ficar completo.",
        suggestedModel: suggested,
      };
    }
    if (orderIsPreSubmission(status) && !balcao) {
      return {
        ok: true,
        warning:
          "Pedido online ainda em rascunho — confirme com o cliente antes de imprimir o recibo.",
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
          "Transferência pendente: considere pró-forma até confirmação do pagamento.",
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  if (model === "FACTURA") {
    if (orderIsPreSubmission(status)) {
      return {
        ok: true,
        warning:
          "Pedido ainda em rascunho — a factura oficial ficará fechada após emissão.",
        suggestedModel: suggested,
      };
    }
    if (isBankTransferPaymentMethod(pm) && status === "SUBMITTED") {
      return {
        ok: true,
        warning:
          "Pagamento por transferência ainda em validação — confirme o recebimento.",
        suggestedModel: suggested,
      };
    }
    return { ok: true, suggestedModel: suggested };
  }

  if (model !== suggested) {
    return {
      ok: true,
      warning: `Para este contexto recomendamos «${modelLabel(suggested)}».`,
      suggestedModel: suggested,
    };
  }

  return { ok: true, suggestedModel: suggested };
}

function modelLabel(model: InvoiceDocumentModel): string {
  return INVOICE_DOCUMENT_MODEL_LABELS[model];
}

/** Pro-forma e factura clássica descarregam PDF; recibo imprime. */
export function documentUsesDownloadDelivery(
  model: InvoiceDocumentModel,
): boolean {
  return model === "FACTURA_POR_FORMA" || model === "FACTURA";
}

export function documentIssueActionForModel(
  model: InvoiceDocumentModel,
): OrderDocumentIssueAction {
  return documentUsesDownloadDelivery(model) ? "DOWNLOAD" : "PRINT";
}

export function documentPrimaryActionLabel(
  model: InvoiceDocumentModel,
): string {
  return documentUsesDownloadDelivery(model)
    ? "Descarregar PDF"
    : "Imprimir PDF";
}

export function documentReprintActionLabel(
  model: InvoiceDocumentModel,
): string {
  return documentUsesDownloadDelivery(model)
    ? "Descarregar PDF novamente"
    : "Imprimir PDF novamente";
}

export function documentDeliveryHint(model: InvoiceDocumentModel): string {
  if (documentUsesDownloadDelivery(model)) {
    return "Gera PDF em folha A4 para descarregar no dispositivo.";
  }
  return "Abre o diálogo de impressão (comprovativo de venda; formato nas configurações da loja).";
}

/** IBAN/dados bancários no PDF. */
export function receiptShouldIncludeBankDetails(
  documentModel: InvoiceDocumentModel,
  paymentMethod: PaymentMethodValue | null | undefined,
): boolean {
  if (
    documentModel === "FACTURA_POR_FORMA" ||
    documentModel === "FACTURA"
  ) {
    return true;
  }
  if (
    documentModel === "FACTURA_RECIBO" &&
    isBankTransferPaymentMethod(paymentMethod)
  ) {
    return true;
  }
  return false;
}
