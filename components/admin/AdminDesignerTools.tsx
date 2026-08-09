"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  adminListOrders,
  claimOrderAsDesigner,
  getUnreadCounts,
  listDesignTemplates,
  type OrderListItem,
} from "@/lib/api-client";
import { openDesignerOrderChat } from "@/lib/designer-chat-events";
import { loadSession } from "@/lib/auth-session";
import { formatMoney } from "@/lib/format-money";
import { ORDER_STATUS_LABEL, orderStatusLabel } from "@/lib/order-status";
import {
  OrderArtPreviewModal,
  type OrderArtPreviewTarget,
} from "@/components/admin/OrderArtPreviewModal";
import { ROUTES, normalizeUserRole } from "@/lib/routes";
import { DesignerResponsibleBadge } from "@/components/order/DesignerResponsibleBanner";

const LIST_PAGE = 100;

const DESIGN_QUEUE = new Set(["SUBMITTED", "VALIDATION_PAYMENT"]);

/** Ordem estável para barra proporcional por estado na amostra. */
const STATUS_MIX_KEYS = [
  "SUBMITTED",
  "VALIDATION_PAYMENT",
  "DRAFT",
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
  "DELIVERED",
  "CANCELLED",
] as const;

function statusStripSolid(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-zinc-500";
    case "SUBMITTED":
      return "bg-amber-500";
    case "VALIDATION_PAYMENT":
      return "bg-blue-500";
    case "APPROVED":
      return "bg-violet-500";
    case "IN_PRODUCTION":
      return "bg-cyan-500";
    case "FINISHED":
      return "bg-sky-500";
    case "DELIVERED":
      return "bg-emerald-500";
    case "CANCELLED":
      return "bg-red-500";
    default:
      return "bg-zinc-600";
  }
}

function DesignerFilaMixBar({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  if (total < 1) return null;
  const segments = STATUS_MIX_KEYS.filter(
    (k) => (counts[k as string] ?? 0) > 0,
  ).map((k) => ({
    status: k,
    n: counts[k as string] ?? 0,
  }));
  if (segments.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Pesos por estado nesta amostra
        </p>
        <p className="text-[11px] tabular-nums text-zinc-600">
          {total} pedido{total !== 1 ? "s" : ""} sincronizado{total !== 1 ? "s" : ""}
        </p>
      </div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-black/35 ring-1 ring-white/[0.06]"
        role="img"
        aria-label="Proporção de pedidos por estado"
      >
        {segments.map(({ status, n }) => (
          <div
            key={status}
            className={`min-h-[6px] min-w-px ${statusStripSolid(status)} opacity-[0.9]`}
            style={{ flex: n }}
            title={`${ORDER_STATUS_LABEL[status] ?? status}: ${n}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600">
        {segments.map(({ status, n }) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStripSolid(status)}`}
              aria-hidden
            />
            <span className="text-zinc-500">
              {ORDER_STATUS_LABEL[status] ?? status}
            </span>
            <span className="font-semibold tabular-nums text-zinc-400">{n}</span>
            <span className="tabular-nums text-zinc-600">
              ({Math.round((n / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Data / hora em duas linhas na lista de mesa. */
function formatUpdatedParts(iso: string): { d: string; t: string } {
  const x = new Date(iso);
  return {
    d: new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(x),
    t: new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(x),
  };
}

const PRIORITY_RANK: Record<string, number> = {
  SUBMITTED: 0,
  VALIDATION_PAYMENT: 1,
  DRAFT: 2,
  APPROVED: 5,
  IN_PRODUCTION: 6,
  FINISHED: 7,
  DELIVERED: 8,
  CANCELLED: 9,
};

type ViewPreset =
  | "priority"
  | "design_queue"
  | "design_queue_unassigned"
  | "design_queue_no_art"
  | "mine"
  | "drafts"
  | "all_recent";

type SortMode = "priority" | "updated_desc" | "updated_asc";

function orderAmount(o: OrderListItem): number {
  const raw = o.totalAmount;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return parseFloat(raw.replace(",", ".")) || 0;
  return Number(raw) || 0;
}

function mergePollHead(
  head: OrderListItem[],
  prev: OrderListItem[],
): OrderListItem[] {
  const headIds = new Set(head.map((o) => o.id));
  return [...head, ...prev.filter((o) => !headIds.has(o.id))];
}

function orderIsClaimable(
  o: OrderListItem,
  viewerId: string,
  role: string,
): boolean {
  if (role !== "DESIGNER" || !viewerId) return false;
  if (o.designer) return false;
  if (DESIGN_QUEUE.has(o.status)) return true;
  return (
    o.status === "DRAFT" &&
    o.orderOrigin === "BALCAO" &&
    Boolean(o.draftSharedWithDesignTeam)
  );
}

function DesignerKpiCard({
  title,
  value,
  hint,
  accent,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  accent: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br ${accent} p-5 ring-1 ring-white/[0.04]`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          {title}
        </p>
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-black/35 text-zinc-400 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">{hint}</p>
    </div>
  );
}

function designerResponsibleRowClass(
  o: OrderListItem,
  viewerId: string,
  role: string,
): string {
  const r = normalizeUserRole(role);
  if (r !== "DESIGNER" || !viewerId) {
    return "border-l-[3px] border-l-transparent";
  }
  if (o.designer) {
    if (o.designer.id !== viewerId) {
      return "border-l-[3px] border-l-amber-500/75 bg-amber-500/[0.04]";
    }
    return "border-l-[3px] border-l-teal-500/60 bg-teal-500/[0.03]";
  }
  if (orderIsClaimable(o, viewerId, role)) {
    return "border-l-[3px] border-l-zinc-500/40";
  }
  return "border-l-[3px] border-l-transparent";
}

function rowHighlightClass(
  unread: number | undefined,
  o: OrderListItem,
  viewerId: string,
  role: string,
): string {
  if (unread && unread > 0) {
    return "border-l-[3px] border-l-sky-400 bg-sky-500/[0.05]";
  }
  return designerResponsibleRowClass(o, viewerId, role);
}

type LoadState = "loading" | "ready" | "error";

const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABEL);

export function AdminDesignerTools() {
  const baseId = useId();
  const [state, setState] = useState<LoadState>("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [templatesMeta, setTemplatesMeta] = useState<{
    total: number;
    active: number;
  } | null>(null);

  const [viewerId, setViewerId] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [viewerName, setViewerName] = useState("");

  const [preset, setPreset] = useState<ViewPreset>("priority");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [searchRaw, setSearchRaw] = useState("");
  const [statusPick, setStatusPick] = useState<string>("");
  const [limit, setLimit] = useState(25);

  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [unreadLoading, setUnreadLoading] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [artPreview, setArtPreview] = useState<OrderArtPreviewTarget | null>(
    null,
  );

  const [nextSkip, setNextSkip] = useState(LIST_PAGE);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (s?.user) {
      setViewerId(s.user.id);
      setViewerRole(s.user.role);
      setViewerName((s.user.name ?? "").trim());
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setState("loading");
    setErrMsg(null);
    try {
      const [list, tplMaybe] = await Promise.all([
        adminListOrders(LIST_PAGE, 0),
        listDesignTemplates({ all: true }).catch(() => null),
      ]);
      setOrders(list);
      setNextSkip(LIST_PAGE);
      setCanLoadMore(list.length >= LIST_PAGE);
      if (tplMaybe) {
        const active = tplMaybe.filter((t) => t.active).length;
        setTemplatesMeta({ total: tplMaybe.length, active });
      }
      setState("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Erro ao carregar dados.");
      setState("error");
    }
  }, []);

  const loadMoreOrders = useCallback(async () => {
    if (!canLoadMore || loadMoreBusy || state !== "ready") return;
    setLoadMoreBusy(true);
    try {
      const more = await adminListOrders(LIST_PAGE, nextSkip);
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...more.filter((o) => !seen.has(o.id))];
      });
      setNextSkip((s) => s + LIST_PAGE);
      setCanLoadMore(more.length >= LIST_PAGE);
    } catch {
      setToast("Não foi possível carregar mais pedidos.");
    } finally {
      setLoadMoreBusy(false);
    }
  }, [canLoadMore, loadMoreBusy, nextSkip, state]);

  const claimOrder = useCallback(
    async (orderId: string) => {
      setClaimingId(orderId);
      try {
        await claimOrderAsDesigner(orderId);
        setToast("Pedido atribuído a si.");
        await load();
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Não foi possível atribuir.");
      } finally {
        setClaimingId(null);
      }
    },
    [load],
  );

  const resetListFilters = useCallback(() => {
    setPreset("priority");
    setStatusPick("");
    setSearchRaw("");
    setSortMode("priority");
    setLimit(25);
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    const tid = window.setInterval(() => {
      void (async () => {
        try {
          const head = await adminListOrders(LIST_PAGE, 0);
          setOrders((prev) => mergePollHead(head, prev));
        } catch {
          /* silêncio */
        }
      })();
    }, 45_000);
    return () => clearInterval(tid);
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let queue = 0;
    let queueValue = 0;
    let withArt = 0;
    let assignedToMe = 0;
    let activePipeline = 0;
    for (const o of orders) {
      if (DESIGN_QUEUE.has(o.status)) {
        queue += 1;
        queueValue += orderAmount(o);
      }
      if ((o._count?.artVersions ?? 0) > 0) withArt += 1;
      if (viewerId && o.designer?.id === viewerId) assignedToMe += 1;
      if (o.status !== "CANCELLED" && o.status !== "DELIVERED") {
        activePipeline += 1;
      }
    }
    return {
      queue,
      queueValue,
      withArt,
      assignedToMe,
      activePipeline,
      total: orders.length,
      noArtQueue: orders.filter(
        (o) => DESIGN_QUEUE.has(o.status) && o._count.artVersions === 0,
      ).length,
    };
  }, [orders, viewerId]);

  const presetCounts = useMemo(() => {
    const out: Record<ViewPreset, number> = {
      priority: orders.length,
      design_queue: 0,
      design_queue_unassigned: 0,
      design_queue_no_art: 0,
      mine: 0,
      drafts: 0,
      all_recent: orders.length,
    };
    for (const o of orders) {
      if (DESIGN_QUEUE.has(o.status)) {
        out.design_queue += 1;
        if (!o.designer) out.design_queue_unassigned += 1;
        if ((o._count?.artVersions ?? 0) === 0)
          out.design_queue_no_art += 1;
      }
      if (viewerId && o.designer?.id === viewerId) out.mine += 1;
      if (o.status === "DRAFT") out.drafts += 1;
    }
    return out;
  }, [orders, viewerId]);

  const sampleStatusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) {
      c[o.status] = (c[o.status] ?? 0) + 1;
    }
    return c;
  }, [orders]);

  const applyPreset = useCallback(
    (list: OrderListItem[], p: ViewPreset): OrderListItem[] => {
      switch (p) {
        case "design_queue":
          return list.filter((o) => DESIGN_QUEUE.has(o.status));
        case "design_queue_unassigned":
          return list.filter(
            (o) => DESIGN_QUEUE.has(o.status) && !o.designer,
          );
        case "design_queue_no_art":
          return list.filter(
            (o) =>
              DESIGN_QUEUE.has(o.status) &&
              (o._count.artVersions ?? 0) === 0,
          );
        case "mine":
          return list.filter((o) => viewerId && o.designer?.id === viewerId);
        case "drafts":
          return list.filter((o) => o.status === "DRAFT");
        case "all_recent":
        case "priority":
        default:
          return list;
      }
    },
    [viewerId],
  );

  const searchQ = searchRaw.trim().toLowerCase();

  const filteredAndSorted = useMemo(() => {
    let rows = applyPreset(orders, preset);

    if (statusPick) {
      rows = rows.filter((o) => o.status === statusPick);
    }

    if (searchQ) {
      rows = rows.filter((o) => {
        const n = (o.orderNumber ?? "").toLowerCase();
        const cn = (o.client.name ?? "").toLowerCase();
        const ce = (o.client.email ?? "").toLowerCase();
        const dn = (o.designer?.name ?? "").toLowerCase();
        return (
          n.includes(searchQ) ||
          cn.includes(searchQ) ||
          ce.includes(searchQ) ||
          dn.includes(searchQ)
        );
      });
    }

    const cp = [...rows];
    if (sortMode === "updated_desc") {
      return cp.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    if (sortMode === "updated_asc") {
      return cp.sort(
        (a, b) =>
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      );
    }
    return cp.sort((a, b) => {
      const ra = PRIORITY_RANK[a.status] ?? 4;
      const rb = PRIORITY_RANK[b.status] ?? 4;
      if (ra !== rb) return ra - rb;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [
    orders,
    preset,
    statusPick,
    searchQ,
    sortMode,
    applyPreset,
  ]);

  const filteredSortedIdsKey = useMemo(
    () => filteredAndSorted.map((o) => o.id).join("|"),
    [filteredAndSorted],
  );

  const visibleRows = useMemo(
    () => filteredAndSorted.slice(0, limit),
    [filteredAndSorted, limit],
  );

  useEffect(() => {
    if (state !== "ready" || filteredAndSorted.length === 0) {
      setUnreadMap({});
      return;
    }

    let cancelled = false;

    async function fetchUnreadBatch() {
      setUnreadLoading(true);
      try {
        const map = await getUnreadCounts(filteredAndSorted.map((o) => o.id));
        if (!cancelled) setUnreadMap(map);
      } catch {
        if (!cancelled) setUnreadMap({});
      } finally {
        if (!cancelled) setUnreadLoading(false);
      }
    }

    void fetchUnreadBatch();
    return () => {
      cancelled = true;
    };
  }, [state, filteredSortedIdsKey, filteredAndSorted]);

  async function copyOrderNumber(num: string) {
    try {
      await navigator.clipboard.writeText(num);
      setToast(`Nº ${num} copiado.`);
    } catch {
      setToast("Não foi possível copiar.");
    }
  }

  const hideBillingForDesigner = viewerRole === "DESIGNER";

  function exportCsvVisible() {
    const header =
      "order_number;client;status;currency;total;items;art_versions;updated;designer;order_id";
    const lines = filteredAndSorted.map((o) => {
      const des = (o.designer?.name ?? "").replaceAll(";", ",");
      return [
        o.orderNumber,
        `"${(o.client.name ?? "").replaceAll('"', '""')}"`,
        o.status,
        o.currency,
        String(orderAmount(o)),
        String(o._count.items),
        String(o._count.artVersions),
        o.updatedAt,
        `"${des}"`,
        o.id,
      ].join(";");
    });
    const blob = new Blob([header + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dadiva-design-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("CSV exportado.");
  }

  const presetTabs: { id: ViewPreset; label: string }[] = [
    { id: "priority", label: "Prioridade" },
    { id: "design_queue", label: "Fila criativa" },
    {
      id: "design_queue_unassigned",
      label: "Fila · sem responsável",
    },
    { id: "design_queue_no_art", label: "Fila · sem arte" },
    { id: "mine", label: "Meus pedidos" },
    { id: "drafts", label: "Rascunhos" },
    { id: "all_recent", label: "Todos" },
  ];

  const viewerFirstName = viewerName.split(/\s+/).filter(Boolean)[0] ?? "";

  return (
    <div className="p-6 sm:p-8">
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[60] max-w-sm rounded-lg border border-zinc-600/40 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 shadow-xl ring-1 ring-white/10"
        >
          {toast}
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-violet-950/15 px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-amber-600/5 blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          Área de design
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ferramentas de designer
        </h1>
        {viewerFirstName ? (
          <p className="mt-2 text-lg font-medium text-zinc-300">
            Olá, <span className="text-white">{viewerFirstName}</span>
          </p>
        ) : null}
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          {hideBillingForDesigner ? (
            <>
              Fila criativa com filtros, mensagens não lidas por pedido e
              modelos catalogados — alinhado com a lista de permissões da API.
            </>
          ) : (
            <>
              Fila criativa com filtros, mensagens não lidas por pedido,
              exportação e modelos catalogados — alinhado com a lista de
              permissões da API.
            </>
          )}
        </p>
        {viewerRole === "DESIGNER" ? (
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Para{" "}
            <span className="text-zinc-400">
              aprovar após validação interna do pedido e avançar produção até finalizado
            </span>
            , abre{" "}
            <Link
              href={ROUTES.admin.pedidos}
              className="font-semibold text-amber-300/95 underline-offset-2 hover:underline"
            >
              Pedidos · estados
            </Link>
            {" "}
            no menu, escolhe o pedido e usa «Avançar estado» — só aparecem transições permitidas
            ao teu perfil (o mesmo fluxo que para atendentes e administradores, sem duplicar aqui
            na fila).
          </p>
        ) : null}
        <dl className="mt-6 grid gap-4 text-xs text-zinc-500 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
            <dt className="font-medium uppercase tracking-wider text-zinc-600">
              Amostra
            </dt>
            <dd className="mt-1 tabular-nums text-zinc-300">
              {stats.total >= LIST_PAGE ? `${stats.total}+` : stats.total}{" "}
              carregados · até {LIST_PAGE} por pedido à API · use{" "}
              <span className="text-zinc-400">Carregar mais</span> para páginas
              seguintes
            </dd>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
            <dt className="font-medium uppercase tracking-wider text-zinc-600">
              Templates
            </dt>
            <dd className="mt-1 text-zinc-300">
              {templatesMeta ? (
                <>
                  <span className="tabular-nums">{templatesMeta.active}</span>{" "}
                  activos de{" "}
                  <span className="tabular-nums">{templatesMeta.total}</span>{" "}
                  totais
                </>
              ) : (
                state === "ready" ? "—" : "A carregar…"
              )}
            </dd>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
            <dt className="font-medium uppercase tracking-wider text-zinc-600">
              Perfil
            </dt>
            <dd className="mt-1 text-zinc-300">
              {viewerRole || "—"}{" "}
              ·{" "}
              {viewerRole === "DESIGNER"
                ? "pedidos seus + fila criativa sem designer (API)."
                : "visão conforme papel."}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full bg-amber-500/90 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400"
          >
            Actualizar tudo
          </button>
          <button
            type="button"
            disabled={!canLoadMore || loadMoreBusy}
            onClick={() => void loadMoreOrders()}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-teal-400/30 enabled:hover:bg-teal-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadMoreBusy
              ? "A carregar…"
              : canLoadMore
                ? `Carregar mais (${LIST_PAGE})`
                : "Fim da lista"}
          </button>
          {!hideBillingForDesigner && (
            <button
              type="button"
              disabled={filteredAndSorted.length === 0}
              onClick={exportCsvVisible}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-emerald-400/30 enabled:hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Exportar CSV ({filteredAndSorted.length})
            </button>
          )}
          {!hideBillingForDesigner && (
            <Link
              href={ROUTES.admin.pedidos}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-500/10"
            >
              Pedidos &amp; faturamento
            </Link>
          )}
          <Link
            href={ROUTES.admin.modelos}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Modelos prontos
          </Link>
        </div>
        <div className="mt-8">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Atalhos rápidos
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={ROUTES.admin.modelos}
              className="group rounded-2xl border border-white/[0.07] bg-black/25 p-4 ring-1 ring-white/[0.03] transition hover:border-violet-400/25 hover:bg-violet-950/20"
            >
              <p className="text-sm font-semibold text-zinc-100">
                Modelos prontos
              </p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                Catálogo e duplicação para novos pedidos.
              </p>
            </Link>
            <Link
              href={ROUTES.admin.restaurarImagem}
              className="group rounded-2xl border border-white/[0.07] bg-black/25 p-4 ring-1 ring-white/[0.03] transition hover:border-sky-400/25 hover:bg-sky-950/20"
            >
              <p className="text-sm font-semibold text-zinc-100">
                Restaurar imagem
              </p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                Ferramenta de apoio ao cliente e à arte.
              </p>
            </Link>
            <Link
              href={ROUTES.admin.pedidos}
              className="group rounded-2xl border border-white/[0.07] bg-black/25 p-4 ring-1 ring-white/[0.03] transition hover:border-amber-400/25 hover:bg-amber-950/15 sm:col-span-2 lg:col-span-1"
            >
              <p className="text-sm font-semibold text-zinc-100">
                Pedidos · estados
              </p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                Avançar fases, entregas e visão completa da operação.
              </p>
            </Link>
          </div>
        </div>
      </div>

      {state === "error" && (
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {errMsg ?? "Erro desconhecido."}
        </div>
      )}

      {state === "loading" && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: hideBillingForDesigner ? 5 : 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-zinc-900/60 ring-1 ring-white/[0.06]"
            />
          ))}
        </div>
      )}

      {state === "ready" && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <DesignerKpiCard
              title="Fila criativa"
              value={String(stats.queue)}
              hint={
                hideBillingForDesigner
                  ? "Pedidos submetidos na fila criativa"
                  : "Submetido e validação/pagamento"
              }
              accent="from-violet-500/20 to-transparent"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              }
            />
            {!hideBillingForDesigner && (
              <DesignerKpiCard
                title="Valor na fila"
                value={formatMoney(stats.queueValue, "AOA")}
                hint="Total na fila criativa (amostra)"
                accent="from-violet-600/18 to-transparent"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8" />
                    <path d="M12 18V6" />
                  </svg>
                }
              />
            )}
            <DesignerKpiCard
              title="Fila · sem arte"
              value={String(stats.noArtQueue)}
              hint="Prioridade — ainda sem versões no editor"
              accent="from-rose-500/15 to-transparent"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 00-2.828 0L6 21" />
                  <path d="m3 3 18 18" />
                </svg>
              }
            />
            <DesignerKpiCard
              title="Com versões de arte"
              value={String(stats.withArt)}
              hint="Pelo menos uma versão gravada"
              accent="from-sky-500/15 to-transparent"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m12.83 2.18a2 2 0 012.43-.44l4.93 3.18a2 2 0 011.11 2.21l-4.53 21.92a2 2 0 01-3.53.71L14 21" />
                  <path d="M18.92 21.93 4.93 21.93a2 2 0 01-1.69-3.07l4.93-15.93a2 2 0 011.73-1.23h13.93" />
                </svg>
              }
            />
            <DesignerKpiCard
              title="Atribuídos a si"
              value={String(stats.assignedToMe)}
              hint={
                viewerRole === "DESIGNER"
                  ? "Campo designer = a sua conta"
                  : "Equipa interna"
              }
              accent="from-amber-500/20 to-transparent"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />
            <DesignerKpiCard
              title="Activos"
              value={String(stats.activePipeline)}
              hint="Exc. entregues e cancelados"
              accent="from-emerald-500/12 to-transparent"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              }
            />
          </div>

          <DesignerFilaMixBar
            counts={sampleStatusCounts}
            total={orders.length}
          />

          <div className="mt-8">
            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 sm:p-6">
              {/* ── Cabeçalho ── */}
              <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/75">
                    Lista operacional
                  </p>
                  <h2 className="mt-1 text-base font-semibold tracking-tight text-white sm:text-lg">
                    Trabalhos e pedidos
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                    Pedidos com ordenação e filtros definidos em baixo. A coluna{" "}
                    <span className="text-zinc-400">Responsável</span> indica quem já
                    reclamou o trabalho na fila — evite dois designers sobre o mesmo
                    pedido; o servidor só aceita um primeiro «Atribuir a mim». Como
                    perfil designer, margem{' '}
                    <span className="text-teal-400/90">teal</span> = pedidos seus,{" "}
                    <span className="text-amber-400/85">âmbar</span> se outro colega
                    estiver responsável, <span className="text-zinc-400">cinza</span>{" "}
                    quando pode reclamar. Linhas com mensagens novas no chat usam margem{' '}
                    <span className="text-sky-400/90">azul</span> à esquerda — clique
                    na coluna <span className="text-zinc-400">Chat</span> ou no cartão{" "}
                    móvel. Use <span className="text-zinc-400">Editor web</span> na arte
                    na mesma rota do cliente. <span className="text-zinc-400">
                      Atribuir a mim
                    </span>{" "}
                    só na vista sem responsável.
                  </p>
                </div>
                {!hideBillingForDesigner && (
                  <Link
                    href={ROUTES.admin.pedidos}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/35 px-4 py-2.5 text-xs font-semibold text-amber-400/95 ring-1 ring-inset ring-white/[0.03] transition hover:border-amber-400/25 hover:bg-amber-500/[0.06] hover:text-amber-300"
                  >
                    Abrir operador completo
                    <span aria-hidden className="text-amber-400/60">→</span>
                  </Link>
                )}
              </div>

              {/* ── Vistas (presets) ── */}
              <div className="border-b border-white/[0.06] py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    Vista
                  </p>
                  <div
                    className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-end sm:pb-0 sm:pl-4"
                    role="tablist"
                    aria-label="Vistas de pedidos"
                  >
                    {presetTabs.map((t) => {
                      const n = presetCounts[t.id];
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={preset === t.id}
                          onClick={() => setPreset(t.id)}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition ${
                            preset === t.id
                              ? "bg-amber-500/90 text-zinc-950 shadow-sm shadow-amber-500/20"
                              : "bg-zinc-800/70 text-zinc-400 ring-1 ring-white/[0.04] hover:bg-zinc-800 hover:text-zinc-200"
                          }`}
                        >
                          {t.label}
                          <span
                            className={`min-w-[1.25rem] rounded-md px-1 py-0.5 text-center text-[10px] tabular-nums ${
                              preset === t.id
                                ? "bg-zinc-950/15 text-zinc-900"
                                : "bg-black/35 text-zinc-500"
                            }`}
                          >
                            {n}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Filtros e ordenação ── */}
              <div className="py-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Filtrar e ordenar
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end lg:gap-x-3 lg:gap-y-3">
                  <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-5">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Pesquisar
                    </span>
                    <input
                      type="search"
                      value={searchRaw}
                      onChange={(e) => setSearchRaw(e.target.value)}
                      placeholder="Nº do pedido, cliente, e-mail ou designer…"
                      className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-amber-400/35 focus:outline-none focus:ring-1 focus:ring-amber-400/35"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 lg:col-span-2">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Estado
                    </span>
                    <select
                      id={`${baseId}-status`}
                      value={statusPick}
                      onChange={(e) => setStatusPick(e.target.value)}
                      title="Filtrar por estado do pedido"
                      className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white focus:border-amber-400/35 focus:outline-none"
                    >
                      <option value="">Todos os estados</option>
                      {STATUS_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {ORDER_STATUS_LABEL[code]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 lg:col-span-3">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Ordenação
                    </span>
                    <select
                      value={sortMode}
                      onChange={(e) =>
                        setSortMode(e.target.value as SortMode)
                      }
                      className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white focus:border-amber-400/35 focus:outline-none"
                    >
                      <option value="priority">Fase / prioridade operacional</option>
                      <option value="updated_desc">
                        Actualização (mais recente)
                      </option>
                      <option value="updated_asc">
                        Actualização (mais antigo)
                      </option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 lg:col-span-2">
                    <span className="text-[11px] font-medium text-zinc-500">
                      Linhas por página
                    </span>
                    <select
                      value={String(limit)}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white focus:border-amber-400/35 focus:outline-none"
                    >
                      <option value="15">15</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* ── Resumo da lista ── */}
              <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.05] bg-black/25 px-4 py-3 text-[11px] text-zinc-500">
                <span className="tabular-nums">
                  <span className="text-zinc-600">Resultados</span>{" "}
                  <span className="font-semibold text-zinc-300">
                    {filteredAndSorted.length}
                  </span>
                </span>
                <span aria-hidden className="hidden h-3 w-px bg-zinc-700 sm:inline-block" />
                <span>
                  {unreadLoading ? (
                    <span className="text-zinc-500">A ler mensagens…</span>
                  ) : (
                    <>
                      <span className="text-zinc-600">Chat</span>{" "}
                      <span className="font-semibold text-zinc-300">
                        {
                          Object.values(unreadMap).filter((u) => u > 0)
                            .length
                        }{" "}
                        pedidos com não lidas
                      </span>
                      <span className="text-zinc-600">
                        {" "}
                        (vista actual:{" "}
                        <span className="font-semibold text-zinc-300">
                          {filteredAndSorted.length}
                        </span>{" "}
                        pedidos ·{" "}
                        <span className="tabular-nums">{visibleRows.length}</span>{" "}
                        linhas na tabela)
                      </span>
                    </>
                  )}
                </span>
              </div>

              <div className="mt-4 hidden max-h-[min(68vh,720px)] overflow-auto rounded-xl border border-white/[0.06] bg-black/20 md:block">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-zinc-950/95 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
                    <tr className="border-b border-white/[0.06] text-zinc-500">
                      <th className="px-3 py-2.5 font-medium">Pedido</th>
                      <th className="px-3 py-2.5 font-medium">Cliente</th>
                      <th className="px-3 py-2.5 font-medium hidden md:table-cell min-w-[7.5rem] max-w-[10rem]" title="Quem já está com o trabalho na fila — ver texto de ajuda em cima.">
                        Responsável
                      </th>
                      {!hideBillingForDesigner && (
                        <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                          Total
                        </th>
                      )}
                      <th className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                        Itens
                      </th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                        Estado
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium">
                        Arte
                      </th>
                      <th
                        className="max-w-[5.5rem] px-3 py-2.5 text-center font-medium"
                        title="Abre um único painel: pré-visualização, ZIP e editor web."
                      >
                        Painel
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium">
                        Chat
                      </th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                        Actualização
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hideBillingForDesigner ? 9 : 10}
                          className="px-3 py-12 text-center text-sm text-zinc-500"
                        >
                          <p className="mb-3">Sem resultados com estes filtros.</p>
                          <button
                            type="button"
                            onClick={resetListFilters}
                            className="rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
                          >
                            Repor vista Prioridade e limpar filtros
                          </button>
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((o, rowIdx) => {
                        const unread = unreadMap[o.id] ?? 0;
                        const hi = rowHighlightClass(
                          unread,
                          o,
                          viewerId,
                          viewerRole,
                        );
                        const showClaim = orderIsClaimable(o, viewerId, viewerRole);
                        const zebra =
                          rowIdx % 2 === 1 ? "bg-white/[0.02]" : "";
                        const upd = formatUpdatedParts(o.updatedAt);
                        return (
                          <tr
                            key={o.id}
                            className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] ${hi} ${zebra}`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {o.orderOrigin === "BALCAO" ? (
                                  <span className="rounded border border-teal-500/35 bg-teal-500/10 px-1 py-0.5 text-[8px] font-bold uppercase text-teal-200">
                                    Balcão
                                  </span>
                                ) : null}
                                <span className="font-mono text-[11px] text-zinc-200">
                                  {o.orderNumber}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                <button
                                  type="button"
                                  title="Copiar número do pedido"
                                  onClick={() => void copyOrderNumber(o.orderNumber)}
                                  className="text-[10px] font-medium text-zinc-500 underline-offset-2 hover:text-amber-300 hover:underline"
                                >
                                  Copiar
                                </button>
                                {showClaim ? (
                                  <button
                                    type="button"
                                    disabled={claimingId === o.id}
                                    title="Atribuir este pedido a si na fila"
                                    onClick={() => void claimOrder(o.id)}
                                    className="text-[10px] font-semibold text-teal-400 underline-offset-2 hover:text-teal-300 hover:underline disabled:opacity-45"
                                  >
                                    {claimingId === o.id
                                      ? "A atribuir…"
                                      : "Atribuir a mim"}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="max-w-[150px] truncate px-3 py-2.5 text-zinc-300">
                              {o.client.name}
                              <p className="mt-0.5 truncate text-[10px] text-zinc-600">
                                {o.client.email}
                              </p>
                            </td>
                            <td className="hidden px-3 py-2.5 md:table-cell">
                              <DesignerResponsibleBadge
                                designer={o.designer}
                                viewerId={viewerId}
                                viewerRole={viewerRole}
                                claimVisible={showClaim}
                              />
                            </td>
                            {!hideBillingForDesigner && (
                              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-zinc-300">
                                {formatMoney(orderAmount(o), o.currency)}
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-center tabular-nums text-zinc-500">
                              {o._count.items}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] text-zinc-300">
                                {orderStatusLabel(o.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-zinc-400">
                              {o._count.artVersions}
                            </td>
                            <td className="max-w-[5.5rem] px-2 py-2.5 text-center">
                              <button
                                type="button"
                                title="Arte, ZIP e editor web"
                                onClick={() =>
                                  setArtPreview({
                                    orderId: o.id,
                                    orderNumber: o.orderNumber,
                                  })
                                }
                                className="inline-flex rounded-lg bg-violet-500/12 px-2.5 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/25 transition hover:bg-violet-500/20 hover:text-white"
                              >
                                Ver arte
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                title={
                                  unread > 0
                                    ? "Abrir chat — mensagens não lidas"
                                    : "Abrir chat do pedido"
                                }
                                onClick={() => openDesignerOrderChat(o.id)}
                                className="inline-flex min-w-[1.75rem] justify-center rounded-md bg-black/35 px-1.5 py-0.5 tabular-nums text-[11px] text-zinc-300 ring-1 ring-white/[0.06] transition hover:border-amber-500/35 hover:bg-amber-950/35 hover:text-amber-200"
                              >
                                {unreadLoading ? (
                                  <span className="opacity-40">–</span>
                                ) : unread > 0 ? (
                                  <span className="font-semibold text-sky-300">
                                    {unread}
                                  </span>
                                ) : (
                                  "0"
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-500">
                              <div className="whitespace-nowrap leading-tight">
                                <div className="text-zinc-400">{upd.d}</div>
                                <div className="text-[10px] text-zinc-600">
                                  {upd.t}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-3 md:hidden">
                {visibleRows.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
                    <p>Sem resultados com estes filtros.</p>
                    <button
                      type="button"
                      onClick={resetListFilters}
                      className="mt-3 rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200"
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : (
                  visibleRows.map((o) => {
                    const unread = unreadMap[o.id] ?? 0;
                    const showClaim = orderIsClaimable(
                      o,
                      viewerId,
                      viewerRole,
                    );
                    const rowHi = rowHighlightClass(
                      unread,
                      o,
                      viewerId,
                      viewerRole,
                    );
                    return (
                      <div
                        key={o.id}
                        className={`space-y-2 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 text-xs ${rowHi}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {o.orderOrigin === "BALCAO" ? (
                              <span className="rounded border border-teal-500/35 bg-teal-500/10 px-1 py-0.5 text-[8px] font-bold uppercase text-teal-200">
                                Balcão
                              </span>
                            ) : null}
                            <span className="font-mono text-[11px] text-zinc-200">
                              {o.orderNumber}
                            </span>
                          </div>
                          <span className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-[10px] text-zinc-300">
                            {orderStatusLabel(o.status)}
                          </span>
                        </div>
                        <p className="truncate text-zinc-300">{o.client.name}</p>
                        <p className="truncate text-[10px] text-zinc-600">
                          {o.client.email}
                        </p>
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2">
                          <DesignerResponsibleBadge
                            designer={o.designer}
                            viewerId={viewerId}
                            viewerRole={viewerRole}
                            claimVisible={showClaim}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void copyOrderNumber(o.orderNumber)}
                            className="text-[10px] font-medium text-amber-400/90"
                          >
                            Copiar Nº
                          </button>
                          {showClaim ? (
                            <button
                              type="button"
                              disabled={claimingId === o.id}
                              onClick={() => void claimOrder(o.id)}
                              className="text-[10px] font-semibold text-teal-400 disabled:opacity-45"
                            >
                              {claimingId === o.id ? "…" : "Atribuir a mim"}
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            title="Arte, ZIP e editor web"
                            onClick={() =>
                              setArtPreview({
                                orderId: o.id,
                                orderNumber: o.orderNumber,
                              })
                            }
                            className="rounded-lg bg-violet-500/12 px-2.5 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/25"
                          >
                            Ver arte
                          </button>
                          <button
                            type="button"
                            onClick={() => openDesignerOrderChat(o.id)}
                            className="rounded-lg bg-black/35 px-2.5 py-1 text-[11px] ring-1 ring-white/[0.08]"
                          >
                            Chat ({unreadLoading ? "…" : unread})
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {filteredAndSorted.length > limit && (
                <p className="mt-4 text-center text-[11px] text-zinc-500">
                  A mostrar{" "}
                  <span className="tabular-nums">{visibleRows.length}</span>{" "}
                  de{" "}
                  <span className="tabular-nums">
                    {filteredAndSorted.length}
                  </span>{" "}
                  — aumente <span className="text-zinc-400">Mostrar</span> para
                  ver mais.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <OrderArtPreviewModal
        open={artPreview !== null}
        target={artPreview}
        onClose={() => setArtPreview(null)}
        onNotify={setToast}
      />
    </div>
  );
}
