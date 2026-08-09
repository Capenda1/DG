import type { OrderDetail, OrderListItem } from "./api-client";

export function formatModelagemSavedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Última composição gravada no editor (`ArtVersion` maior `versionIndex`). */
export function getLatestArtVersion(
  versions: OrderDetail["artVersions"] | undefined | null,
) {
  if (!versions?.length) return null;
  let best = versions[0]!;
  for (let i = 1; i < versions.length; i++) {
    const row = versions[i]!;
    if (row.versionIndex > best.versionIndex) best = row;
  }
  return best;
}

/** Pedido em rascunho: quem está naturalmente associado antes da primeira gravação ou entre sessões. */
export function describeDraftResponsibleLine(
  o: Pick<OrderListItem, "status" | "orderOrigin" | "client" | "designer"> &
    Partial<Pick<OrderListItem, "attendant">>,
): string {
  if (o.status !== "DRAFT") return "";
  const d = o.designer?.name?.trim();
  if (d) return `Designer atribuído: ${d}.`;
  if (o.orderOrigin === "BALCAO") {
    const a = o.attendant?.name?.trim();
    if (a) return `Rascunho iniciado no balcão por ${a}.`;
    return "Rascunho de pedido de balcão (PDV).";
  }
  const c = o.client.name.trim();
  return c ? `Rascunho do cliente: ${c}.` : "Rascunho do cliente.";
}
