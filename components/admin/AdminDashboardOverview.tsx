"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminListOrders,
  getFinancePdvSessionCurrent,
  getFinanceSalesSummary,
  getInsumosDashboard,
  listCounterDraftOrders,
  type ApiRequestError,
  type CounterDraftSummary,
  type FinancePdvSessionCurrent,
  type FinanceSalesSummary,
  type InsumosDashboard,
  type OrderListItem,
} from "@/lib/api-client";
import { formatMoney } from "@/lib/format-money";
import { orderStatusLabel } from "@/lib/order-status";
import { ROUTES } from "@/lib/routes";
import { IconBox } from "@/components/admin/admin-nav-icons";

function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  return Number(v) || 0;
}

function dateKeyLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortDay(key: string): string {
  const [y, mo, da] = key.split("-").map(Number);
  if (!y || !mo || !da) return key;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
  }).format(new Date(y, mo - 1, da));
}

const PIPELINE_EXCLUDE = new Set(["CANCELLED", "DELIVERED", "DRAFT"]);

const PRODUCTION_STATUSES = new Set([
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
]);

const DESIGN_QUEUE = new Set(["SUBMITTED", "VALIDATION_PAYMENT"]);

/** Alinhado com o limite máximo do backend (`orders.service` safeTake). */
const ADMIN_ORDERS_TAKE = 200;

type LoadState = "loading" | "ready" | "error";
type OpsTone = "open" | "closed" | "warn" | "neutral";

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CHART_HEIGHT = 280;

function useMeasuredChartWidth(minWidth = 240) {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const setContainerRef = useCallback(
    (node: null | HTMLDivElement) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      nodeRef.current = node;
      if (!node || typeof ResizeObserver === "undefined") {
        setWidth(0);
        return;
      }

      function commit() {
        const el = nodeRef.current;
        if (!el) return;
        const w = Math.floor(el.getBoundingClientRect().width);
        setWidth(Number.isFinite(w) && w > 0 ? Math.max(minWidth, w) : 0);
      }

      commit();
      const ro = new ResizeObserver(commit);
      ro.observe(node);
      observerRef.current = ro;
    },
    [minWidth],
  );

  return { setContainerRef, width };
}

type DashboardStatusChartRow = { key: string; label: string; count: number };
type DashboardTrendRow = { dia: string; pedidos: number };

function DashboardStatusBarChart({ rows }: { rows: DashboardStatusChartRow[] }) {
  const { setContainerRef, width } = useMeasuredChartWidth();
  return (
    <div
      ref={setContainerRef}
      className="mt-4 h-[280px] w-full min-h-0 min-w-0"
    >
      {rows.length === 0 ? (
        <p className="py-20 text-center text-sm text-zinc-500">Sem dados.</p>
      ) : width > 0 ? (
        <BarChart
          width={width}
          height={CHART_HEIGHT}
          data={rows}
          layout="vertical"
          margin={{ left: 4, right: 16, top: 8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272a"
            horizontal={false}
          />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(251, 191, 36, 0.06)" }}
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e4e4e7" }}
            formatter={(value) => [
              typeof value === "number" ? value : 0,
              "Pedidos",
            ]}
          />
          <Bar
            dataKey="count"
            name="Pedidos"
            fill="#d97706"
            radius={[0, 6, 6, 0]}
            maxBarSize={22}
          />
        </BarChart>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-500">
          A preparar gráfico…
        </div>
      )}
    </div>
  );
}

function DashboardTrendAreaChart({
  data,
  gradientId,
}: {
  data: DashboardTrendRow[];
  gradientId: string;
}) {
  const { setContainerRef, width } = useMeasuredChartWidth();
  return (
    <div
      ref={setContainerRef}
      className="mt-4 h-[280px] w-full min-h-0 min-w-0"
    >
      {width > 0 ? (
        <AreaChart
          width={width}
          height={CHART_HEIGHT}
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272a"
            vertical={false}
          />
          <XAxis
            dataKey="dia"
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e4e4e7" }}
            formatter={(value) => [
              typeof value === "number" ? value : 0,
              "Novos pedidos",
            ]}
          />
          <Area
            type="monotone"
            dataKey="pedidos"
            name="Novos pedidos"
            stroke="#f59e0b"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-500">
          A preparar gráfico…
        </div>
      )}
    </div>
  );
}

export function AdminDashboardOverview() {
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [insumosDash, setInsumosDash] = useState<InsumosDashboard | null>(null);
  const [pdvSession, setPdvSession] = useState<FinancePdvSessionCurrent | null>(
    null,
  );
  const [counterDrafts, setCounterDrafts] = useState<CounterDraftSummary[]>([]);
  const [salesToday, setSalesToday] = useState<FinanceSalesSummary | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const isRefresh = opts?.refresh === true;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setState("loading");
    }
    setErrMsg(null);
    try {
      const today = todayIsoDate();
      const [
        ordersResult,
        insumosResult,
        pdvResult,
        draftsResult,
        salesResult,
      ] = await Promise.allSettled([
        adminListOrders(ADMIN_ORDERS_TAKE),
        getInsumosDashboard(),
        getFinancePdvSessionCurrent(),
        listCounterDraftOrders(),
        getFinanceSalesSummary(today, today),
      ]);

      if (ordersResult.status === "rejected") {
        const e = ordersResult.reason;
        let msg =
          e instanceof Error ? e.message : "Erro ao carregar dados.";
        const status =
          typeof e === "object" &&
          e !== null &&
          "status" in e &&
          typeof (e as ApiRequestError).status === "number"
            ? (e as ApiRequestError).status
            : undefined;
        if (status === 401 || status === 403) {
          msg =
            status === 401
              ? "Não autorizado — a sessão pode ter expirado. Recarregue a página ou volte a iniciar sessão."
              : "Sem permissão para listar pedidos com este perfil.";
        }
        setErrMsg(msg);
        setState("error");
        return;
      }

      setOrders(ordersResult.value);
      setInsumosDash(
        insumosResult.status === "fulfilled" ? insumosResult.value : null,
      );
      setPdvSession(
        pdvResult.status === "fulfilled" ? pdvResult.value : null,
      );
      setCounterDrafts(
        draftsResult.status === "fulfilled" ? draftsResult.value : [],
      );
      setSalesToday(
        salesResult.status === "fulfilled" ? salesResult.value : null,
      );
      setState("ready");
    } catch (e) {
      let msg =
        e instanceof Error ? e.message : "Erro ao carregar dados.";
      const status =
        typeof e === "object" &&
        e !== null &&
        "status" in e &&
        typeof (e as ApiRequestError).status === "number"
          ? (e as ApiRequestError).status
          : undefined;
      if (status === 401 || status === 403) {
        msg =
          status === 401
            ? "Não autorizado — a sessão pode ter expirado. Recarregue a página ou volte a iniciar sessão."
            : "Sem permissão para listar pedidos com este perfil.";
      }
      setErrMsg(msg);
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() inicializa loading/ready/error no painel
    void load();
  }, [load]);

  const areaGradientId = `dash-area-${useId().replace(/:/g, "")}`;

  const stats = useMemo(() => {
    const byStatus = new Map<string, number>();
    let pipelineValue = 0;
    let productionCount = 0;
    let designQueueCount = 0;
    const clientIds = new Set<string>();

    for (const o of orders) {
      byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
      clientIds.add(o.client.id);
      const amt = parseAmount(o.totalAmount);
      if (!PIPELINE_EXCLUDE.has(o.status)) {
        pipelineValue += amt;
      }
      if (PRODUCTION_STATUSES.has(o.status)) productionCount += 1;
      if (DESIGN_QUEUE.has(o.status)) designQueueCount += 1;
    }

    const statusChart = [...byStatus.entries()]
      .map(([status, count]) => ({
        key: status,
        label: orderStatusLabel(status),
        count,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const today = new Date();
    const dayKeys: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dayKeys.push(`${y}-${m}-${day}`);
    }
    const perDay = new Map<string, number>();
    for (const k of dayKeys) perDay.set(k, 0);
    for (const o of orders) {
      const k = dateKeyLocal(o.createdAt);
      if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const trend = dayKeys.map((k) => ({
      dia: formatShortDay(k),
      pedidos: perDay.get(k) ?? 0,
    }));

    const recent = [...orders]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 6);

    return {
      total: orders.length,
      uniqueClients: clientIds.size,
      pipelineValue,
      productionCount,
      designQueueCount,
      statusChart,
      trend,
      recent,
      draftCount: byStatus.get("DRAFT") ?? 0,
      finishedCount: byStatus.get("FINISHED") ?? 0,
    };
  }, [orders]);

  const pdvOpen = pdvSession != null && pdvSession.closedAt == null;

  return (
    <div className="p-6 sm:p-8">
      {/* Cabeçalho */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-amber-950/20 px-6 py-8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-[1] before:h-[3px] before:bg-gradient-to-r before:from-amber-500 before:via-violet-500 before:to-sky-500 before:opacity-95 before:content-[''] sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-amber-600/5 blur-2xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          Administração
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Painel de controlo
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Visão operacional: caixa PDV, vendas do dia, filas de pedidos, stock e
          atalhos rápidos para balcão, finanças e facturação.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href={ROUTES.admin.pedidoBalcao}
            className="rounded-full bg-amber-500/90 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400"
          >
            Abrir balcão PDV
          </Link>
          <Link
            href={ROUTES.admin.pedidos}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-500/10"
          >
            Fila de pedidos
          </Link>
          <Link
            href={ROUTES.admin.financeiro}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-500/10"
          >
            Finanças
          </Link>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void load({ refresh: state === "ready" })}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-60"
          >
            {refreshing ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-amber-400" />
            ) : null}
            {refreshing ? "A actualizar…" : "Actualizar dados"}
          </button>
        </div>
      </div>

      {state === "error" && (
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {errMsg ?? "Erro desconhecido."}
        </div>
      )}

      {state === "loading" && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`ops-${i}`}
                className="h-32 animate-pulse rounded-2xl bg-zinc-900/60 ring-1 ring-white/[0.06]"
              />
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`kpi-${i}`}
                className="h-28 animate-pulse rounded-2xl bg-zinc-900/60 ring-1 ring-white/[0.06]"
              />
            ))}
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`ins-${i}`}
                className="h-28 animate-pulse rounded-2xl bg-zinc-900/60 ring-1 ring-white/[0.06]"
              />
            ))}
          </div>
        </>
      )}

      {state === "ready" && (
        <>
          {/* Operação PDV — widgets rápidos */}
          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400/85">
                  Operação hoje
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Caixa, vendas e balcão num relance.
                </p>
              </div>
              <p className="text-[10px] text-zinc-600">
                Pedidos: últimos {ADMIN_ORDERS_TAKE} registos
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <OpsCard
                title="Turno de caixa"
                value={pdvOpen ? "Aberta" : "Fechada"}
                subtitle={
                  pdvOpen
                    ? `Operador: ${pdvSession?.openedBy.name ?? "—"}`
                    : "Abre um turno em Caixa PDV para vender no balcão"
                }
                href={ROUTES.admin.caixa}
                tone={pdvOpen ? "open" : "closed"}
                icon={<CashIcon />}
              />
              <OpsCard
                title="Vendas hoje"
                value={
                  salesToday
                    ? formatMoney(salesToday.totalRevenue, salesToday.currency)
                    : "—"
                }
                subtitle={
                  salesToday
                    ? `${salesToday.entryCount} pagamento${salesToday.entryCount === 1 ? "" : "s"} · Balcão ${formatMoney(salesToday.balcaoRevenue, salesToday.currency)}`
                    : "Resumo financeiro indisponível"
                }
                href={ROUTES.admin.financeiro}
                tone="neutral"
                icon={<ChartIcon />}
              />
              <OpsCard
                title="Rascunhos balcão"
                value={String(counterDrafts.length)}
                subtitle={
                  counterDrafts.length > 0
                    ? `${counterDrafts.length} pedido${counterDrafts.length === 1 ? "" : "s"} em pausa no PDV`
                    : "Nenhum rascunho em pausa"
                }
                href={ROUTES.admin.pedidoBalcao}
                tone={counterDrafts.length > 0 ? "warn" : "neutral"}
                icon={<StoreIcon />}
              />
              <OpsCard
                title="Prontos p/ entrega"
                value={String(stats.finishedCount)}
                subtitle="Pedidos finalizados à espera de entrega ao cliente"
                href={`${ROUTES.admin.pedidos}?status=FINISHED`}
                tone={stats.finishedCount > 0 ? "warn" : "neutral"}
                icon={<ClipboardIcon />}
              />
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Pedidos analisados"
              value={String(stats.total)}
              hint={`Últimos ${ADMIN_ORDERS_TAKE} registos na API`}
              accent="from-amber-500/20 to-transparent"
            />
            <KpiCard
              title="Clientes com pedidos"
              value={String(stats.uniqueClients)}
              hint="Contas distintas nesta amostra"
              accent="from-sky-500/15 to-transparent"
            />
            <KpiCard
              title="Valor em pipeline"
              value={formatMoney(stats.pipelineValue, "AOA")}
              hint="Exclui rascunho, entregue e cancelado"
              accent="from-emerald-500/15 to-transparent"
            />
            <KpiCard
              title="Fila design / produção"
              value={`${stats.designQueueCount} / ${stats.productionCount}`}
              hint="Aguardam arte vs. em produção ou finalizados"
              accent="from-violet-500/15 to-transparent"
            />
          </div>

          {insumosDash ? (
            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Armazém · insumos
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Stock activo, valor a custo e linhas em alerta de mínimo.
                  </p>
                </div>
                <Link
                  href={ROUTES.admin.insumos}
                  className="text-xs font-medium text-amber-400/90 hover:text-amber-300"
                >
                  Abrir stock · insumos →
                </Link>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <KpiCard
                  title="Insumos activos"
                  value={String(insumosDash.total)}
                  hint="Itens activos no catálogo de stock"
                  accent="from-zinc-500/12 to-transparent"
                />
                <KpiCard
                  title="Custo total do stock"
                  value={formatMoney(
                    parseAmount(insumosDash.custoTotalStock ?? "0"),
                    "AOA",
                  )}
                  hint="Σ (unidades × custo unitário)"
                  accent="from-sky-500/15 to-transparent"
                />
                <KpiCard
                  title="Alertas (≤ mínimo)"
                  value={String(insumosDash.alertas.length)}
                  hint="Com stock mínimo definido &gt; 0"
                  accent={
                    insumosDash.alertas.length > 0
                      ? "from-amber-500/20 to-transparent"
                      : "from-emerald-500/10 to-transparent"
                  }
                />
              </div>
              {insumosDash.alertas.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 ring-1 ring-amber-500/10">
                  <p className="text-xs font-semibold text-amber-200">
                    Itens em ou abaixo do stock mínimo
                  </p>
                  <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-[11px] text-zinc-300">
                    {insumosDash.alertas.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex flex-wrap gap-x-1">
                        <span className="font-medium text-zinc-200">
                          {a.nome}
                        </span>
                        <span className="text-zinc-500">
                          · {a.stock_actual} / mín. {a.stock_minimo}{" "}
                          {a.unidade}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {insumosDash.alertas.length > 8 ? (
                    <p className="mt-2 text-[10px] text-zinc-500">
                      +{insumosDash.alertas.length - 8} mais em Stock · insumos.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-white/[0.06] bg-zinc-900/35 px-4 py-3 text-xs leading-relaxed text-zinc-500 ring-1 ring-white/[0.04]">
              Resumo de insumos indisponível (erro de rede ou sem permissão para o
              armazém).
            </div>
          )}

          {/* Gráficos */}
          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-5 ring-1 ring-white/[0.04] lg:col-span-2">
              <h2 className="text-sm font-semibold text-white">
                Pedidos por estado
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Distribuição nos últimos {ADMIN_ORDERS_TAKE} pedidos
              </p>
              <DashboardStatusBarChart rows={stats.statusChart} />
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-5 ring-1 ring-white/[0.04] lg:col-span-3">
              <h2 className="text-sm font-semibold text-white">
                Novos pedidos (14 dias)
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Contagem por dia de criação
              </p>
              <DashboardTrendAreaChart
                data={stats.trend}
                gradientId={areaGradientId}
              />
            </div>
          </div>

          {/* Actividade recente + módulos */}
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 lg:col-span-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Actividade recente
                </h2>
                <Link
                  href={ROUTES.admin.pedidos}
                  className="text-xs font-medium text-amber-400/90 hover:text-amber-300"
                >
                  Ver todos
                </Link>
              </div>
              <ul className="mt-4 space-y-3">
                {stats.recent.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-white/[0.08] px-3 py-8 text-center text-xs text-zinc-500">
                    Ainda não há pedidos recentes nesta amostra.
                  </li>
                ) : (
                  stats.recent.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`${ROUTES.admin.pedidos}?order=${o.id}`}
                        className="group block rounded-xl border border-transparent px-2 py-2 transition hover:border-white/[0.08] hover:bg-white/[0.03]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-zinc-200 group-hover:text-white">
                            {o.orderNumber}
                          </span>
                          <span className="shrink-0 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {orderStatusLabel(o.status)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                          {o.client.name} ·{" "}
                          {formatMoney(o.totalAmount, o.currency)}
                        </p>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-white">Módulos</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Vendas, produção e administração
              </p>

              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-500/80">
                PDV · Finanças
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <ModuleCard
                  title="Balcão PDV"
                  description="Novo pedido, rascunhos e pagamento."
                  href={ROUTES.admin.pedidoBalcao}
                  icon={<StoreIcon />}
                  badge={
                    counterDrafts.length > 0
                      ? `${counterDrafts.length} rasc.`
                      : undefined
                  }
                  featured
                />
                <ModuleCard
                  title="Caixa PDV"
                  description="Abrir/fechar turno e movimentos."
                  href={ROUTES.admin.caixa}
                  icon={<CashIcon />}
                  badge={pdvOpen ? "Aberta" : undefined}
                  featured
                />
                <ModuleCard
                  title="Finanças"
                  description="Razão, vendas e margem balcão."
                  href={ROUTES.admin.financeiro}
                  icon={<ChartIcon />}
                  featured
                />
                <ModuleCard
                  title="Facturas"
                  description="Recibos, facturas e pro-forma."
                  href={ROUTES.admin.facturas.root}
                  icon={<InvoiceIcon />}
                  featured
                />
              </div>

              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                Operação · Catálogo
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <ModuleCard
                  title="Pedidos"
                  description="Estados, chat e operações."
                  href={ROUTES.admin.pedidos}
                  icon={<ClipboardIcon />}
                  badge={
                    stats.finishedCount > 0
                      ? `${stats.finishedCount} prontos`
                      : stats.draftCount > 0
                        ? `${stats.draftCount} rasc.`
                        : undefined
                  }
                />
                <ModuleCard
                  title="Clientes"
                  description="Contas com perfil Cliente."
                  href={ROUTES.admin.clientes}
                  icon={<UsersIcon />}
                />
                <ModuleCard
                  title="Stock · insumos"
                  description="Entradas de armazém e movimentos."
                  href={ROUTES.admin.insumos}
                  icon={<IconBox className="h-5 w-5" />}
                  badge={
                    insumosDash && insumosDash.alertas.length > 0
                      ? `${insumosDash.alertas.length} alerta${insumosDash.alertas.length === 1 ? "" : "s"}`
                      : undefined
                  }
                />
                <ModuleCard
                  title="Produtos & variantes"
                  description="Catálogo e preços."
                  href={ROUTES.admin.produtos}
                  icon={<TagIcon />}
                />
                <ModuleCard
                  title="Relatórios"
                  description="Facturação e desempenho."
                  href={ROUTES.admin.relatorios}
                  icon={<ChartIcon />}
                />
                <ModuleCard
                  title="Área designer"
                  description="Pedidos atribuídos à arte."
                  href={ROUTES.admin.designer}
                  icon={<PenIcon />}
                />
                <ModuleCard
                  title="Modelos prontos"
                  description="Templates do editor."
                  href={ROUTES.admin.modelos}
                  icon={<GridIcon />}
                />
                <ModuleCard
                  title="Utilizadores"
                  description="Equipa interna e perfis."
                  href={ROUTES.admin.utilizadores}
                  icon={<TeamIcon />}
                />
                <ModuleCard
                  title="RH"
                  description="Colaboradores, férias e ausências."
                  href={ROUTES.admin.rh}
                  icon={<TeamIcon />}
                />
                <ModuleCard
                  title="SMS · pedidos"
                  description="Histórico Twilio (finalizado)."
                  href={ROUTES.admin.notificacoesSms}
                  icon={<ChartIcon />}
                />
                <ModuleCard
                  title="Configurações"
                  description="Pagamentos e sistema."
                  href={ROUTES.admin.configuracoes}
                  icon={<GearIcon />}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OpsCard({
  title,
  value,
  subtitle,
  href,
  tone,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  href: string;
  tone: OpsTone;
  icon: ReactNode;
}) {
  const toneClass =
    tone === "open"
      ? "border-emerald-500/35 bg-gradient-to-br from-emerald-500/12 to-zinc-900/40"
      : tone === "closed"
        ? "border-red-500/25 bg-gradient-to-br from-red-950/30 to-zinc-900/40"
        : tone === "warn"
          ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-zinc-900/40"
          : "border-white/[0.08] bg-gradient-to-br from-zinc-900/55 to-zinc-950/40";

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border p-4 ring-1 ring-white/[0.04] transition hover:-translate-y-0.5 hover:ring-amber-400/20 ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </p>
          <p className="mt-1.5 truncate text-xl font-bold tabular-nums tracking-tight text-white">
            {value}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-zinc-400">{subtitle}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-400 ring-1 ring-white/[0.06] transition group-hover:bg-amber-500/15 group-hover:text-amber-300">
          {icon}
        </span>
      </div>
    </Link>
  );
}

function KpiCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br ${accent} p-5 ring-1 ring-white/[0.04]`}
    >
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">{hint}</p>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  href,
  icon,
  badge,
  featured,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
        featured
          ? "border-amber-500/20 bg-amber-500/[0.06] hover:border-amber-400/35 hover:bg-amber-500/10"
          : "border-white/[0.07] bg-zinc-950/40 hover:border-amber-400/25 hover:bg-zinc-900/60"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-400 ring-1 ring-white/[0.06] transition group-hover:bg-amber-500/15 group-hover:text-amber-400 group-hover:ring-amber-400/25">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white group-hover:text-amber-100">
            {title}
          </h3>
          {badge && (
            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/20">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
          {description}
        </p>
      </div>
      <svg
        className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-amber-400"
        fill="none"
        viewBox="0 0 16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M6 3l5 5-5 5" />
      </svg>
    </Link>
  );
}

function UsersIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 4h11L20 8v3h-2.5v10h-11V11H4V8z" />
      <path d="M9 4V3a3 3 0 0 1 6 0v1" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M19.8 4.2l1.4-1.4" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10h.01M18 14h.01" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l2-4h14l2 4" />
      <path d="M4 9h16v11H4z" />
      <path d="M9 14h6" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  );
}
