"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OrderPhaseStrip } from "@/components/order/OrderPhaseStrip";
import {
  deleteOrder,
  getUnreadCounts,
  listOrders,
  type OrderListItem,
} from "@/lib/api-client";
import {
  clientMayDeleteOwnDraft,
  orderIsBalcao,
} from "@/lib/order-client-mutations";
import {
  clientDesignActionForOrder,
  clientNextActionHint,
  formatShortOrderDate,
} from "@/lib/order-client-ui";
import { orderStatusLabel } from "@/lib/order-status";
import { contaPedidoPath, ROUTES } from "@/lib/routes";
import { formatMoney } from "@/lib/format-money";

const ORDERS_TAKE = 200;

function statusBadgeClass(status: string): string {
  if (status === "DELIVERED")
    return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25";
  if (status === "CANCELLED") return "bg-red-500/10 text-red-300 ring-red-500/20";
  if (status === "DRAFT") return "bg-white/5 text-zinc-400 ring-white/10";
  if (["APPROVED", "IN_PRODUCTION", "FINISHED"].includes(status))
    return "bg-amber-400/10 text-amber-300 ring-amber-400/20";
  if (status === "VALIDATION_PAYMENT" || status === "SUBMITTED")
    return "bg-blue-500/10 text-blue-300 ring-blue-500/20";
  return "bg-amber-400/10 text-amber-300 ring-amber-400/20";
}

const STATUS_GROUPS = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Em curso" },
  { id: "DRAFT", label: "Rascunho" },
  { id: "DELIVERED", label: "Entregues" },
  { id: "CANCELLED", label: "Cancelados" },
] as const;

type StatusGroupId = (typeof STATUS_GROUPS)[number]["id"];

function matchGroup(order: OrderListItem, group: string): boolean {
  if (group === "all") return true;
  if (group === "active")
    return !["DELIVERED", "CANCELLED", "DRAFT"].includes(order.status);
  if (group === "CANCELLED") return order.status === "CANCELLED";
  return order.status === group;
}

function formatShortDate(iso: string): string {
  return formatShortOrderDate(iso);
}

function designActionForOrder(order: OrderListItem) {
  const action = clientDesignActionForOrder(order);
  if (!action) return null;
  return { ...action, label: "Design" };
}

function nextActionHint(order: OrderListItem, unread: number) {
  return clientNextActionHint(order, unread);
}

function OrderRowActions({
  order,
  onDelete,
}: {
  order: OrderListItem;
  onDelete: (order: OrderListItem) => void;
}) {
  const design = designActionForOrder(order);

  return (
    <div
      className="flex items-center justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {design ? (
        <Link
          href={design.href}
          className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-400 transition hover:bg-amber-400/15 hover:text-amber-300"
        >
          {design.label}
        </Link>
      ) : null}
      {order.status === "DRAFT" && clientMayDeleteOwnDraft(order) ? (
        <button
          type="button"
          onClick={() => onDelete(order)}
          aria-label={`Eliminar pedido ${order.orderNumber}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 bg-red-950/10 text-red-400/70 transition hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-300"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 16 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2 4h12M6 4V2h4v2M13 4l-1 9H4L3 4M7 7v4M9 7v4" />
          </svg>
        </button>
      ) : null}
      <Link
        href={contaPedidoPath(order.id)}
        className="text-zinc-600 transition hover:text-amber-400"
        aria-label={`Ver detalhe do pedido ${order.orderNumber}`}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 16 16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 3l5 5-5 5" />
        </svg>
      </Link>
    </div>
  );
}

function OrderOriginBadge({ order }: { order: OrderListItem }) {
  if (orderIsBalcao(order)) {
    return (
      <span className="inline-flex rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-violet-500/20">
        Balcão
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300 ring-1 ring-sky-500/20">
      Online
    </span>
  );
}

export default function ContaPedidosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<StatusGroupId>(
    () => (searchParams.get("group") as StatusGroupId) ?? "all",
  );
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [pendingDelete, setPendingDelete] = useState<OrderListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const isRefresh = opts?.refresh === true;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const rows = await listOrders(ORDERS_TAKE);
      setOrders(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar os pedidos.",
      );
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (group !== "all") params.set("group", group);
    if (search.trim()) params.set("q", search.trim());
    const qs = params.toString();
    router.replace(
      qs ? `${ROUTES.accountPedidos}?${qs}` : ROUTES.accountPedidos,
      { scroll: false },
    );
  }, [group, search, router]);

  useEffect(() => {
    async function fetchUnread() {
      if (orders.length === 0) return;
      try {
        const map = await getUnreadCounts(orders.map((o) => o.id));
        setUnreadMap(map);
      } catch {
        /* silencioso */
      }
    }
    void fetchUnread();
    const id = setInterval(() => void fetchUnread(), 10_000);
    return () => clearInterval(id);
  }, [orders]);

  useEffect(() => {
    if (!pendingDelete) return;
    deleteCancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setPendingDelete(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  const filtered = useMemo(() => {
    let rows = orders.filter((o) => matchGroup(o, group));
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.trackingCode?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...rows].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [orders, group, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    STATUS_GROUPS.forEach(({ id }) => {
      if (id !== "all") c[id] = orders.filter((o) => matchGroup(o, id)).length;
    });
    return c;
  }, [orders]);

  const hasActiveFilters = group !== "all" || search.trim().length > 0;
  const hitTakeLimit = orders.length >= ORDERS_TAKE;

  const handleDelete = useCallback(async (order: OrderListItem) => {
    setDeleting(true);
    try {
      await deleteOrder(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível eliminar.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }, []);

  function clearFilters() {
    setGroup("all");
    setSearch("");
  }

  const listAnimKey = `${group}-${search.trim()}`;

  return (
    <>
      <div className="space-y-5">
        {/* ── Hero ── */}
        <section
          className="conta-animate-fade-up relative overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-4 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.2)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] sm:px-6 sm:py-5"
          style={{ "--conta-delay": "0ms" } as CSSProperties}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
            aria-hidden
          />
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-400/10" />
          <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-violet-500/10 blur-xl dark:bg-violet-500/8" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
                Área do cliente
              </p>
              <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                Os meus pedidos
              </h1>
              <p className="mt-1.5 max-w-lg text-[12px] leading-snug text-zinc-600 dark:text-zinc-400 sm:text-[13px]">
                {orders.length > 0
                  ? `${orders.length} pedido${orders.length !== 1 ? "s" : ""} — filtra, pesquisa e acompanha o progresso.`
                  : "Acompanha todos os teus pedidos num só lugar."}
                {hitTakeLimit ? (
                  <span className="mt-1 block text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    A mostrar os últimos {ORDERS_TAKE} pedidos.
                  </span>
                ) : null}
              </p>

              {!loading && orders.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: "active" as const, label: "Em curso", value: counts.active ?? 0, tone: "amber" },
                    { id: "DRAFT" as const, label: "Rascunhos", value: counts.DRAFT ?? 0, tone: "zinc" },
                    { id: "DELIVERED" as const, label: "Entregues", value: counts.DELIVERED ?? 0, tone: "emerald" },
                  ].map((chip, i) =>
                    chip.value > 0 ? (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setGroup(chip.id)}
                        className={`conta-animate-scale-in rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums ring-1 transition hover:scale-[1.03] ${
                          group === chip.id
                            ? "bg-amber-400/15 text-amber-800 ring-amber-400/35 dark:text-amber-200"
                            : chip.tone === "emerald"
                              ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20 dark:text-emerald-300"
                              : chip.tone === "amber"
                                ? "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300"
                                : "bg-zinc-500/10 text-zinc-700 ring-zinc-500/15 dark:text-zinc-300"
                        }`}
                        style={{ "--conta-delay": `${120 + i * 60}ms` } as CSSProperties}
                      >
                        {chip.value} {chip.label.toLowerCase()}
                      </button>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>

            <div
              className="conta-animate-fade-up flex flex-wrap items-center gap-2 self-start sm:flex-col sm:items-stretch"
              style={{ "--conta-delay": "80ms" } as CSSProperties}
            >
              <Link
                href={ROUTES.accountPedidoNovo}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2.5 text-[12px] font-bold text-zinc-950 shadow-md shadow-amber-500/25 transition hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-400/30 dark:shadow-amber-900/20 sm:min-w-[9.5rem]"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 12 12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6 1v10M1 6h10" />
                </svg>
                Novo pedido
              </Link>
              <button
                type="button"
                onClick={() => void load({ refresh: !loading && orders.length > 0 })}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300/80 bg-white/60 px-4 py-2 text-[11px] font-semibold text-zinc-700 transition hover:border-amber-300/60 hover:text-amber-800 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-amber-400/30 dark:hover:text-amber-300 sm:min-w-[9.5rem]"
              >
                {refreshing ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400" />
                ) : null}
                {loading ? "A carregar…" : refreshing ? "A actualizar…" : "Actualizar"}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div
            className="conta-animate-fade-up rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {/* ── Filtros ── */}
        {!loading && orders.length > 0 ? (
          <div
            className="conta-animate-fade-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            style={{ "--conta-delay": "120ms" } as CSSProperties}
          >
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar pedidos">
              {STATUS_GROUPS.map(({ id, label }) =>
                counts[id] > 0 || id === "all" ? (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={group === id}
                    onClick={() => setGroup(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-300 ${
                      group === id
                        ? "conta-filter-pill--active bg-amber-400/15 text-amber-800 ring-1 ring-amber-400/30 dark:text-amber-300"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                    }`}
                  >
                    {label}
                    {counts[id] > 0 ? (
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                          group === id
                            ? "bg-amber-400/20 text-amber-900 dark:text-amber-200"
                            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {counts[id]}
                      </span>
                    ) : null}
                  </button>
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <svg
                  className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  fill="none"
                  viewBox="0 0 16 16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M11 11l3 3" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="N.º ou código rastreio…"
                  aria-label="Pesquisar pedidos"
                  className="w-full rounded-xl border border-zinc-300/80 bg-white/70 py-2 pl-8 pr-3 text-xs text-zinc-900 placeholder-zinc-400 transition focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/15 dark:border-zinc-700/60 dark:bg-zinc-800/50 dark:text-white dark:placeholder-zinc-500 sm:w-52"
                />
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/5 dark:hover:text-zinc-300"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── Loading ── */}
        {loading ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="A carregar pedidos">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="conta-skeleton-shimmer h-[4.25rem] rounded-xl ring-1 ring-zinc-200/50 dark:ring-white/[0.04]"
                style={{ animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        ) : null}

        {/* ── Vazio ── */}
        {!loading && filtered.length === 0 && !error ? (
          <div
            className="conta-animate-scale-in rounded-2xl border border-dashed border-zinc-300 bg-white/50 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900/20"
            style={{ "--conta-delay": "160ms" } as CSSProperties}
          >
            <svg
              className="conta-empty-float mx-auto mb-4 h-11 w-11 text-zinc-400 dark:text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.2"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
              />
            </svg>
            {hasActiveFilters ? (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-500">
                  Nenhum pedido corresponde ao filtro.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-block rounded-lg bg-amber-400/15 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-400/25 dark:text-amber-300"
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-500">
                  Ainda não tens pedidos.
                </p>
                <Link
                  href={ROUTES.accountPedidoNovo}
                  className="mt-4 inline-block rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
                >
                  Criar o primeiro pedido
                </Link>
              </>
            )}
          </div>
        ) : null}

        {/* ── Cards mobile ── */}
        {!loading && filtered.length > 0 ? (
          <div key={listAnimKey} className="space-y-3 md:hidden">
            {filtered.map((o, i) => {
              const unread = unreadMap[o.id] ?? 0;
              const hint = nextActionHint(o, unread);
              return (
                <Link
                  key={o.id}
                  href={contaPedidoPath(o.id)}
                  className={`conta-animate-stagger conta-order-card block rounded-2xl border border-zinc-200/80 bg-white/80 p-4 dark:border-white/[0.07] dark:bg-zinc-900/40 ${
                    unread > 0 ? "border-l-[3px] border-l-sky-400" : ""
                  }`}
                  style={{ "--conta-i": i } as CSSProperties}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-white">{o.orderNumber}</span>
                        <OrderOriginBadge order={o} />
                        {unread > 0 ? (
                          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold tabular-nums text-sky-700 ring-1 ring-sky-400/30 dark:text-sky-200">
                            {unread} msg
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Criado {formatShortDate(o.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusBadgeClass(o.status)}`}
                    >
                      {orderStatusLabel(o.status)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <OrderPhaseStrip status={o.status} compact />
                  </div>
                  {hint ? (
                    <p className="mt-2 text-[11px] font-medium text-amber-700/90 dark:text-amber-300/90">
                      {hint}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/[0.06]">
                    <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                      {formatMoney(o.totalAmount, o.currency)}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {o._count.items} artigo{o._count.items !== 1 ? "s" : ""}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}

        {/* ── Tabela desktop ── */}
        {!loading && filtered.length > 0 ? (
          <div
            key={`table-${listAnimKey}`}
            className="conta-animate-fade-up hidden overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/60 dark:border-white/[0.07] dark:bg-zinc-900/30 md:block"
            style={{ "--conta-delay": "100ms" } as CSSProperties}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <caption className="sr-only">Lista de pedidos</caption>
                <thead>
                  <tr className="border-b border-zinc-200/80 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-white/[0.07] dark:bg-black/40">
                    <th className="px-4 py-3">N.º de pedido</th>
                    <th className="px-4 py-3">Progresso</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Criado</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Artigos</th>
                    <th className="px-4 py-3 text-right tabular-nums">Total</th>
                    <th className="hidden px-4 py-3 xl:table-cell">Actualizado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60 dark:divide-white/[0.05]">
                  {filtered.map((o, i) => {
                    const unread = unreadMap[o.id] ?? 0;
                    const hint = nextActionHint(o, unread);
                    return (
                      <tr
                        key={o.id}
                        className={`conta-animate-stagger conta-table-row cursor-pointer ${
                          unread > 0 ? "border-l-[3px] border-l-sky-400/80" : ""
                        }`}
                        style={{ "--conta-i": i } as CSSProperties}
                        onClick={() => router.push(contaPedidoPath(o.id))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(contaPedidoPath(o.id));
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Pedido ${o.orderNumber}, ${orderStatusLabel(o.status)}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-900 dark:text-white">
                              {o.orderNumber}
                            </span>
                            <OrderOriginBadge order={o} />
                            {unread > 0 ? (
                              <span
                                className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-sky-700 ring-1 ring-sky-400/30 dark:text-sky-200"
                                title={`${unread} mensagem${unread !== 1 ? "ns" : ""} não lida${unread !== 1 ? "s" : ""}`}
                              >
                                {unread}
                              </span>
                            ) : null}
                          </div>
                          {hint ? (
                            <p className="mt-1 text-[10px] text-amber-700/90 dark:text-amber-300/80">{hint}</p>
                          ) : null}
                        </td>
                        <td className="min-w-[7rem] px-4 py-3.5">
                          <OrderPhaseStrip status={o.status} compact />
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusBadgeClass(o.status)}`}
                          >
                            {orderStatusLabel(o.status)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3.5 text-xs text-zinc-500 lg:table-cell">
                          {formatShortDate(o.createdAt)}
                        </td>
                        <td className="hidden px-4 py-3.5 tabular-nums text-zinc-500 sm:table-cell">
                          {o._count.items}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                          {formatMoney(o.totalAmount, o.currency)}
                        </td>
                        <td className="hidden px-4 py-3.5 text-xs text-zinc-500 xl:table-cell">
                          {formatShortDate(o.updatedAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <OrderRowActions
                            order={o}
                            onDelete={setPendingDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Modal confirmação de eliminação ── */}
      {pendingDelete ? (
        <div className="conta-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !deleting && setPendingDelete(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-order-title"
            className="conta-modal-panel relative w-full max-w-sm rounded-2xl border border-red-500/30 bg-zinc-900 p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/30">
              <svg
                className="h-6 w-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <h3 id="delete-order-title" className="text-base font-semibold text-white">
              Eliminar pedido?
            </h3>
            <p className="mt-1.5 text-sm text-zinc-400">
              O pedido{" "}
              <span className="font-semibold text-white">
                {pendingDelete.orderNumber}
              </span>{" "}
              será permanentemente eliminado. Esta acção não pode ser revertida.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-zinc-700/60 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(pendingDelete)}
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
