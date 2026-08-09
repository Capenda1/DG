import type { InvoiceDocumentModel } from "@/lib/payment-receipt-pdf";
import { ROUTES } from "@/lib/routes";

export type FacturaLifecycleStageId = "pro-forma" | "factura" | "recibo";

/** Etapa do ciclo operacional — ordem: proposta → obrigação → liquidação. */
export type FacturaLifecycleStage = {
  id: FacturaLifecycleStageId;
  href: string;
  documentModel: InvoiceDocumentModel;
  title: string;
  shortTitle: string;
  actionLabel: string;
  subtitle: string;
  body: string;
  /** Rótulo na seta para a etapa seguinte. */
  transitionToNext: string | null;
  editable: boolean;
  closedAfterIssue: boolean;
  movesStock: boolean;
  generatesFiscalObligation: boolean;
};

export const FACTURA_LIFECYCLE_STAGES: FacturaLifecycleStage[] = [
  {
    id: "pro-forma",
    href: ROUTES.admin.facturas.proForma,
    documentModel: "FACTURA_POR_FORMA",
    title: "Factura-Pro-Forma",
    shortTitle: "Factura-Pro-Forma",
    actionLabel: "Editar / visualizar",
    subtitle: "Documento de proposta",
    body: "Rascunho de proposta. Não movimenta stock nem gera obrigações fiscais imediatas. Pode ser reemitida ou convertida numa factura oficial.",
    transitionToNext: "Conversão",
    editable: true,
    closedAfterIssue: false,
    movesStock: false,
    generatesFiscalObligation: false,
  },
  {
    id: "factura",
    href: ROUTES.admin.facturas.factura,
    documentModel: "FACTURA",
    title: "Faturas",
    shortTitle: "Factura",
    actionLabel: "Gera obrigação",
    subtitle: "Documento oficial de venda",
    body: "Documenta a transação oficial. Após emissão o documento fica fechado (inalterável) — não pode ser modificado nem apagado; só reemitir o mesmo PDF.",
    transitionToNext: "Liquidação",
    editable: false,
    closedAfterIssue: true,
    movesStock: false,
    generatesFiscalObligation: true,
  },
  {
    id: "recibo",
    href: ROUTES.admin.facturas.recibo,
    documentModel: "FACTURA_RECIBO",
    title: "Factura-Recibo",
    shortTitle: "Factura-Recibo",
    actionLabel: "Comprova pagamento",
    subtitle: "Venda a pronto pagamento",
    body: "Utilizada quando a entrega e o recebimento ocorrem em simultâneo. Prova de pagamento (total ou parcial) e liquidação da dívida.",
    transitionToNext: null,
    editable: false,
    closedAfterIssue: true,
    movesStock: false,
    generatesFiscalObligation: true,
  },
];

export function lifecycleStageById(
  id: FacturaLifecycleStageId,
): FacturaLifecycleStage {
  const stage = FACTURA_LIFECYCLE_STAGES.find((s) => s.id === id);
  if (!stage) return FACTURA_LIFECYCLE_STAGES[0];
  return stage;
}

export function lifecycleStageByModel(
  model: InvoiceDocumentModel,
): FacturaLifecycleStage | undefined {
  return FACTURA_LIFECYCLE_STAGES.find((s) => s.documentModel === model);
}

export function parseLifecycleStageId(
  raw: string | null | undefined,
): FacturaLifecycleStageId {
  if (raw === "factura" || raw === "recibo" || raw === "pro-forma") {
    return raw;
  }
  return "pro-forma";
}

/** Pedido já tem factura oficial fechada? */
export function orderHasClosedFactura(order: {
  lastDocumentModel?: string | null;
  lastDocumentNumber?: string | null;
}): boolean {
  return (
    order.lastDocumentModel === "FACTURA" &&
    Boolean(order.lastDocumentNumber?.trim())
  );
}

/** Pedido com pró-forma emitida — candidato a conversão. */
export function orderHasProForma(order: {
  lastDocumentModel?: string | null;
  lastDocumentNumber?: string | null;
}): boolean {
  return (
    order.lastDocumentModel === "FACTURA_POR_FORMA" &&
    Boolean(order.lastDocumentNumber?.trim())
  );
}
