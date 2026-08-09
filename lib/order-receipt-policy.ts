/**
 * Na área cliente, recibos e facturas nunca são emitidos/reemitidos pelo próprio
 * utilizador — apenas pela equipa (atendente ou admin) na loja.
 */
export function orderAllowsClientSelfServiceReceipt(_order: {
  orderOrigin?: "ONLINE" | "BALCAO" | null;
}): boolean {
  return false;
}
