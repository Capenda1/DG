/** Rótulos PT para as fases do pedido (Prisma OrderStatus). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Submetido",
  VALIDATION_PAYMENT: "Validação e pagamento",
  APPROVED: "Aprovado",
  IN_PRODUCTION: "Em produção",
  FINISHED: "Finalizado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

/** Chave canónica do enum (ex.: «Validation_Payment» → VALIDATION_PAYMENT). */
function normalizeOrderStatusKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_");
}

/**
 * Texto amigável em português para o estado do pedido.
 * Nunca devolve o identificador técnico cru para o utilizador.
 */
export function orderStatusLabel(status: string): string {
  const t = status?.trim() ?? "";
  if (!t) return "—";
  const k = normalizeOrderStatusKey(t);
  return (
    ORDER_STATUS_LABEL[k] ??
    "Fase do pedido em actualização — contacte a loja se precisar de detalhe."
  );
}