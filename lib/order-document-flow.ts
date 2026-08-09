import type { OrderDetail } from "@/lib/api-client";
import {
  issueOrderDocument,
  type OrderDocumentIssueAction,
} from "@/lib/api-client";
import {
  documentIssueActionForModel,
  documentUsesDownloadDelivery,
} from "@/lib/invoice-document-policy";
import {
  downloadPaymentReceiptPdf,
  openPaymentReceiptForPrint,
  resolvePaymentReceiptPayload,
  type InvoiceDocumentModel,
  type PaymentReceiptBuildOptions,
  type PaymentReceiptPdfPayload,
} from "@/lib/payment-receipt-pdf";

/** Regista emissão na API e monta payload PDF com número interno. */
export async function issueAndBuildReceiptPayload(
  order: OrderDetail,
  opts: PaymentReceiptBuildOptions & {
    documentModel: InvoiceDocumentModel;
    action: OrderDocumentIssueAction;
  },
): Promise<PaymentReceiptPdfPayload> {
  const issue = await issueOrderDocument(order.id, {
    documentModel: opts.documentModel,
    action: opts.action,
  });

  return resolvePaymentReceiptPayload(order, {
    ...opts,
    documentModel: issue.documentModel,
    documentNumber: issue.documentNumber,
  });
}

/** Entrega o PDF conforme o modelo: download (pro-forma/factura) ou impressão (recibo). */
export async function deliverPaymentReceipt(
  payload: PaymentReceiptPdfPayload,
): Promise<void> {
  if (documentUsesDownloadDelivery(payload.documentModel)) {
    await downloadPaymentReceiptPdf(payload);
    return;
  }
  await openPaymentReceiptForPrint(payload);
}

/** Regista emissão, monta payload e entrega conforme o modelo escolhido. */
export async function issueAndDeliverOrderDocument(
  order: OrderDetail,
  opts: PaymentReceiptBuildOptions & {
    documentModel: InvoiceDocumentModel;
    action?: OrderDocumentIssueAction;
  },
): Promise<PaymentReceiptPdfPayload> {
  const action = opts.action ?? documentIssueActionForModel(opts.documentModel);
  const payload = await issueAndBuildReceiptPayload(order, {
    ...opts,
    action,
  });
  await deliverPaymentReceipt(payload);
  return payload;
}
