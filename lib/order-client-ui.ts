import type { OrderListItem } from "./api-client";
import { orderIsBalcao } from "./order-client-mutations";
import { contaPedidoModelagemPath } from "./routes";

export function formatShortOrderDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function clientDesignActionForOrder(
  order: OrderListItem,
): { href: string; label: string } | null {
  if (order.status !== "DRAFT") return null;
  if (orderIsBalcao(order)) return null;
  return { href: contaPedidoModelagemPath(order.id), label: "Abrir design" };
}

export function clientNextActionHint(
  order: OrderListItem,
  unread = 0,
): string | null {
  if (order.status === "CANCELLED") return null;
  if (unread > 0) {
    return `${unread} mensagem${unread !== 1 ? "ns" : ""} nova${unread !== 1 ? "s" : ""} da equipa`;
  }
  if (order.status === "DRAFT" && !orderIsBalcao(order)) {
    return "Completa o design e submete o pedido para avançar.";
  }
  if (order.status === "DRAFT" && orderIsBalcao(order)) {
    return "Pedido gerido pela loja — aguarda conclusão no balcão.";
  }
  if (order.status === "VALIDATION_PAYMENT") {
    return "Pagamento em validação — a equipa irá confirmar em breve.";
  }
  if (order.status === "SUBMITTED") {
    return "Pedido submetido — a equipa irá analisar.";
  }
  if (order.status === "APPROVED") {
    return "Pedido aprovado — preparação para produção.";
  }
  if (order.status === "IN_PRODUCTION") return "O teu pedido está em produção.";
  if (order.status === "FINISHED") return "Pedido finalizado — aguarda entrega.";
  if (order.status === "DELIVERED") return "Pedido entregue.";
  return null;
}
