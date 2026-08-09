"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { OrderArtPreviewModal } from "@/components/admin/OrderArtPreviewModal";
import { ChatBox } from "@/components/chat/ChatBox";
import { OrderPhaseStrip } from "@/components/order/OrderPhaseStrip";
import { deleteOrder, getOrder, getUnreadCount, type OrderDetail } from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { clientMayDeleteOwnDraft, orderIsBalcao } from "@/lib/order-client-mutations";
import {
  clientDesignActionForOrder,
  clientNextActionHint,
} from "@/lib/order-client-ui";
import {
  isBalcaoInstantInsumosOrder,
  orderLineMeta,
  productionProcessLabel,
} from "@/lib/order-line-meta";
import { orderStatusLabel } from "@/lib/order-status";
import { ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/format-money";

function formatDateShort(dateStr: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(dateStr));
}

function statusBadgeClass(status: string): string {
  if (status === "DELIVERED")
    return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300";
  if (status === "CANCELLED")
    return "bg-red-500/10 text-red-800 ring-red-500/20 dark:text-red-300";
  if (status === "DRAFT")
    return "bg-zinc-200/80 text-zinc-700 ring-zinc-300/50 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10";
  if (["APPROVED", "IN_PRODUCTION", "FINISHED"].includes(status))
    return "bg-amber-400/10 text-amber-800 ring-amber-400/20 dark:text-amber-300";
  if (status === "VALIDATION_PAYMENT" || status === "SUBMITTED")
    return "bg-blue-500/10 text-blue-800 ring-blue-500/20 dark:text-blue-300";
  return "bg-amber-400/10 text-amber-800 ring-amber-400/20 dark:text-amber-300";
}

export default function ContaPedidoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unread, setUnread] = useState(0);
  const [artPreviewOpen, setArtPreviewOpen] = useState(false);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!id) return;
      const isRefresh = opts?.refresh === true;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const o = await getOrder(id);
        setOrder(o);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Não foi possível carregar o pedido.",
        );
        setOrder(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;
    if (!loadSession()?.user) {
      router.replace(ROUTES.login);
      return;
    }
    void load();
  }, [id, load, router]);

  useEffect(() => {
    if (!id || !order) return;
    let cancelled = false;
    async function pollUnread() {
      try {
        const count = await getUnreadCount(id);
        if (!cancelled) setUnread(count);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }
    void pollUnread();
    const timer = setInterval(() => void pollUnread(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, order?.id]);

  useEffect(() => {
    if (!confirmDelete) return;
    deleteCancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setConfirmDelete(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteOrder(id);
      router.replace(ROUTES.accountPedidos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível eliminar.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }, [id, router]);

  if (!id) {
    router.replace(ROUTES.accountPedidos);
    return null;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="A carregar pedido">
        <div className="conta-skeleton-shimmer h-28 rounded-xl ring-1 ring-zinc-200/50 dark:ring-zinc-700/40" />
        <div className="conta-skeleton-shimmer h-14 rounded-xl ring-1 ring-zinc-200/40 dark:ring-zinc-800/40" style={{ animationDelay: "60ms" }} />
        <div className="grid gap-4 lg:grid-cols-[1fr_min(280px,32%)]">
          <div className="space-y-3">
            <div className="conta-skeleton-shimmer h-24 rounded-xl" style={{ animationDelay: "100ms" }} />
            <div className="conta-skeleton-shimmer h-40 rounded-xl" style={{ animationDelay: "140ms" }} />
          </div>
          <div className="conta-skeleton-shimmer hidden h-52 rounded-xl lg:block" style={{ animationDelay: "180ms" }} />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="conta-animate-scale-in mx-auto max-w-5xl space-y-5">
        <Link
          href={ROUTES.accountPedidos}
          className="inline-flex text-sm font-medium text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
        >
          ← Voltar aos pedidos
        </Link>
        <div
          className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-4 text-sm text-red-100"
          role="alert"
        >
          {error ?? "Pedido não encontrado."}
        </div>
      </div>
    );
  }

  const designAction = clientDesignActionForOrder(order);
  const nextHint = clientNextActionHint(order, unread);
  const balcaoInsumosOnly = isBalcaoInstantInsumosOrder(order);
  const showChat = order.status !== "CANCELLED" && order.status !== "DRAFT";
  const showArtPreview = order._count.artVersions > 0;
  const sessionUserId = loadSession()?.user?.id ?? "";
  const updatedRecently =
    new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime() > 60_000;

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Hero */}
        <section
          className="conta-animate-fade-up relative overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-4 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.2)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] sm:px-6 sm:py-5"
          style={{ "--conta-delay": "0ms" } as CSSProperties}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
            aria-hidden
          />
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-400/10" />
          <div className="pointer-events-none absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-violet-500/10 blur-xl dark:bg-violet-500/8" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href={ROUTES.accountPedidos}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 transition hover:text-amber-600 dark:text-amber-400/90 dark:hover:text-amber-300"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 16 16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M10 3L5 8l5 5" />
                </svg>
                Voltar aos pedidos
              </Link>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
                Detalhe do pedido
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                  {order.orderNumber}
                </h1>
                {orderIsBalcao(order) ? (
                  <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-violet-500/20 dark:text-violet-300">
                    Balcão
                  </span>
                ) : (
                  <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300">
                    Online
                  </span>
                )}
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusBadgeClass(order.status)}`}
                >
                  {orderStatusLabel(order.status)}
                </span>
                {unread > 0 ? (
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold tabular-nums text-sky-700 ring-1 ring-sky-400/30 dark:text-sky-200">
                    {unread} msg
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">
                Criado {formatDateShort(order.createdAt)}
                {updatedRecently ? (
                  <span className="text-zinc-400">
                    {" "}
                    · actualizado {formatDateShort(order.updatedAt)}
                  </span>
                ) : null}
              </p>
            </div>

            <div
              className="conta-animate-fade-up flex flex-wrap items-center gap-1.5 sm:justify-end"
              style={{ "--conta-delay": "80ms" } as CSSProperties}
            >
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void load({ refresh: true })}
                title="Actualizar"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300/80 bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
              >
                {refreshing ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400" />
                ) : (
                  <span aria-hidden>↻</span>
                )}
                {refreshing ? "…" : "Actualizar"}
              </button>
              {showArtPreview ? (
                <button
                  type="button"
                  onClick={() => setArtPreviewOpen(true)}
                  className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-400/15 dark:text-violet-200"
                >
                  Arte
                </button>
              ) : null}
              {designAction ? (
                <Link
                  href={designAction.href}
                  className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-zinc-950 shadow-sm shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
                >
                  {designAction.label}
                </Link>
              ) : null}
              {order.status === "DRAFT" && clientMayDeleteOwnDraft(order) ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-lg border border-red-500/25 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {(nextHint || orderIsBalcao(order) || order.status === "DELIVERED") ? (
          <div
            className="conta-animate-fade-up rounded-xl border border-amber-200/60 bg-amber-50/50 px-3 py-2.5 text-[12px] leading-snug dark:border-white/[0.06] dark:bg-zinc-900/40"
            style={{ "--conta-delay": "100ms" } as CSSProperties}
          >
            {nextHint ? (
              <p className="font-medium text-amber-900/90 dark:text-amber-100/85">{nextHint}</p>
            ) : null}
            {orderIsBalcao(order) ? (
              <p className={nextHint ? "mt-1 text-zinc-600 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}>
                Pedido de balcão — estado gerido pela loja.
              </p>
            ) : null}
            {order.status === "DELIVERED" && order.deliveredAt ? (
              <p
                className={
                  nextHint || orderIsBalcao(order)
                    ? "mt-1 text-emerald-700 dark:text-emerald-400/90"
                    : "text-emerald-700 dark:text-emerald-400/90"
                }
              >
                Entregue
                {order.deliveredBy?.name?.trim()
                  ? ` por ${order.deliveredBy.name.trim()}`
                  : ""}{" "}
                · {formatDateShort(String(order.deliveredAt))}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_min(280px,32%)] lg:items-start">
          {/* Coluna principal */}
          <div className="min-w-0 space-y-4">
            <div
              className="conta-animate-stagger rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-3 dark:border-white/[0.07] dark:bg-zinc-900/45 sm:px-4"
              style={{ "--conta-i": 0 } as CSSProperties}
            >
              <OrderPhaseStrip
                status={order.status}
                balcaoInsumosOnly={balcaoInsumosOnly}
                compact
              />
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-zinc-200/80 pt-3 text-[11px] dark:border-white/[0.06]">
                <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {formatMoney(order.totalAmount, order.currency)}
                </span>
                <span className="text-zinc-400 dark:text-zinc-600">·</span>
                <span className="text-zinc-600 dark:text-zinc-500">
                  {order.items.length} artigo{order.items.length !== 1 ? "s" : ""}
                </span>
                {order._count.artVersions > 0 ? (
                  <>
                    <span className="text-zinc-400 dark:text-zinc-600">·</span>
                    <span className="text-zinc-600 dark:text-zinc-500">
                      {order._count.artVersions}{" "}
                      {order._count.artVersions !== 1 ? "versões" : "versão"} de arte
                    </span>
                  </>
                ) : null}
                {order.trackingCode ? (
                  <>
                    <span className="text-zinc-400 dark:text-zinc-600">·</span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400">{order.trackingCode}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div
              className="conta-animate-stagger"
              style={{ "--conta-i": 1 } as CSSProperties}
            >
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Artigos
              </h2>
              {order.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-white/50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/20">
                  Sem linhas registadas.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white/60 dark:border-white/[0.07] dark:bg-zinc-900/30">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[20rem] text-left text-[13px]">
                      <caption className="sr-only">Artigos do pedido</caption>
                      <thead>
                        <tr className="border-b border-zinc-200/80 bg-zinc-50/80 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-white/[0.06] dark:bg-black/30">
                          <th className="px-3 py-2">Produto</th>
                          <th className="hidden px-3 py-2 md:table-cell">Detalhes</th>
                          <th className="px-3 py-2 tabular-nums">Qtd</th>
                          <th className="px-3 py-2 text-right tabular-nums">Preço</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/60 dark:divide-white/[0.04]">
                        {order.items.map((line, i) => {
                          const meta = orderLineMeta(
                            line.metadata as Record<string, unknown> | null | undefined,
                          );
                          const skuShow =
                            meta.sku !== "—"
                              ? meta.sku
                              : line.skuCode?.trim()
                                ? line.skuCode
                                : null;
                          const detailParts = [
                            meta.garment !== "—" ? meta.garment : null,
                            meta.color !== "—" ? meta.color : null,
                            meta.size !== "—" ? meta.size : null,
                            productionProcessLabel(line.productionProcess),
                          ].filter(Boolean);
                          return (
                            <tr
                              key={line.id}
                              className="conta-animate-stagger conta-table-row align-top"
                              style={{ "--conta-i": i } as CSSProperties}
                            >
                              <td className="px-3 py-2.5">
                                <p className="font-medium text-zinc-900 dark:text-zinc-100">{line.productName}</p>
                                {skuShow ? (
                                  <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-600">SKU {skuShow}</p>
                                ) : null}
                                {detailParts.length > 0 ? (
                                  <p className="mt-1 text-[10px] text-zinc-500 md:hidden">
                                    {detailParts.join(" · ")}
                                  </p>
                                ) : null}
                              </td>
                              <td className="hidden px-3 py-2.5 text-[11px] text-zinc-500 md:table-cell">
                                {detailParts.length > 0 ? detailParts.join(" · ") : "—"}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-zinc-600 dark:text-zinc-400">
                                {line.quantity}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-zinc-800 dark:text-zinc-300">
                                {formatMoney(line.unitPrice, order.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {order.notes ? (
              <div
                className="conta-animate-fade-up rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2.5 dark:border-white/[0.06] dark:bg-zinc-900/35"
                style={{ "--conta-delay": "180ms" } as CSSProperties}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-600">
                  Notas
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {order.notes}
                </p>
              </div>
            ) : null}
          </div>

          {/* Coluna lateral */}
          <aside
            className="conta-animate-stagger space-y-3 lg:sticky lg:top-4"
            style={{ "--conta-i": 2 } as CSSProperties}
          >
            {order.designer ? (
              <div className="conta-order-card flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-zinc-900/40">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[10px] font-bold text-amber-800 ring-1 ring-amber-400/25 dark:text-amber-300">
                  {order.designer.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-600">
                    Designer
                  </p>
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {order.designer.name}
                  </p>
                </div>
              </div>
            ) : null}

            {showChat ? (
              <div className="conta-order-card rounded-xl border border-zinc-200/80 bg-white/70 p-3 dark:border-white/[0.07] dark:bg-zinc-900/45">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Mensagens
                  </h2>
                  {unread > 0 ? (
                    <span className="conta-filter-pill--active rounded-full bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold tabular-nums text-sky-700 dark:text-sky-200">
                      {unread} nova{unread !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <ChatBox
                  orderId={order.id}
                  currentUserId={sessionUserId}
                  peerLabel="Equipa Dádiva"
                  orderNumber={order.orderNumber}
                  maxH="min(280px,42vh)"
                />
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <OrderArtPreviewModal
        open={artPreviewOpen}
        target={
          artPreviewOpen
            ? { orderId: order.id, orderNumber: order.orderNumber }
            : null
        }
        onClose={() => setArtPreviewOpen(false)}
      />

      {confirmDelete ? (
        <div className="conta-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setConfirmDelete(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-order-detail-title"
            className="conta-modal-panel relative w-full max-w-sm rounded-2xl border border-red-500/30 bg-zinc-900 p-6 shadow-2xl"
          >
            <h3 id="delete-order-detail-title" className="text-base font-semibold text-white">
              Eliminar pedido?
            </h3>
            <p className="mt-1.5 text-sm text-zinc-400">
              O pedido{" "}
              <span className="font-semibold text-white">{order.orderNumber}</span> e
              todos os seus dados serão permanentemente eliminados.
            </p>
            {error ? (
              <p className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-zinc-700/60 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? "A eliminar…" : "Sim, eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
