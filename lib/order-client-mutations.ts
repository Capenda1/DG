/**
 * Regras alinhadas com o backend: pedidos de balcão não são mutáveis pelo cliente
 * na área pessoal; pedidos online podem ser editados/removidos em rascunho pelo próprio cliente.
 */

export function orderIsBalcao(order: {
  orderOrigin?: "ONLINE" | "BALCAO" | null;
}): boolean {
  return order.orderOrigin === "BALCAO";
}

/** Cliente pode eliminar o próprio rascunho só para pedidos criados online. */
export function clientMayDeleteOwnDraft(order: {
  status: string;
  orderOrigin?: "ONLINE" | "BALCAO" | null;
}): boolean {
  return order.status === "DRAFT" && !orderIsBalcao(order);
}
