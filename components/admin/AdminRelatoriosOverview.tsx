"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminListOrders,
  downloadFinanceLedgerCsv,
  downloadFinanceSalesCsv,
  getFinanceSalesSummary,
  getInsumosDashboard,
  PAYMENT_METHOD_LABELS,
  type AdminOrderListRow,
  type FinanceSalesSummary,
  type InsumosDashboard,
  type PaymentMethodValue,
} from "@/lib/api-client";
import {
  labelForApparelBrandId,
  previewAppearanceFromProductName,
} from "@/lib/apparel-catalog";
import { labelForDesignTemplateGarment } from "@/lib/design-template-garment";
import { downloadRelatorioVendasPdf } from "@/lib/export-relatorios-vendas-pdf";
import { formatMoney } from "@/lib/format-money";
import { orderStatusLabel } from "@/lib/order-status";
import { ROUTES } from "@/lib/routes";

/** Ordem: Diário → Semanal → Mensal → Trimestral → Semestral → Anual */
type PeriodPreset = "day" | "week" | "month" | "quarter" | "semester" | "year";

const ORDERS_SAMPLE_TAKE = 200;

function isoDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromIsoDate(iso: string): Date {
  const [y, mo, da] = iso.split("-").map(Number);
  return new Date(y, mo - 1, da);
}

function paymentLabel(code: string): string {
  if (!code) return "—";
  return (
    PAYMENT_METHOD_LABELS[code as PaymentMethodValue] ?? code.replaceAll("_", " ")
  );
}

const PERIOD_ORDER: PeriodPreset[] = [
  "day",
  "week",
  "month",
  "quarter",
  "semester",
  "year",
];

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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
}

function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  const lastMonth = q * 3 + 2;
  return new Date(d.getFullYear(), lastMonth + 1, 0, 23, 59, 59, 999);
}

function startOfSemester(d: Date): Date {
  const firstHalf = d.getMonth() < 6;
  return new Date(d.getFullYear(), firstHalf ? 0 : 6, 1, 0, 0, 0, 0);
}

function endOfSemester(d: Date): Date {
  const firstHalf = d.getMonth() < 6;
  return firstHalf
    ? new Date(d.getFullYear(), 6, 0, 23, 59, 59, 999)
    : new Date(d.getFullYear(), 12, 0, 23, 59, 59, 999);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/** Intervalo do calendário (cortado ao fim de hoje — não inclui datas futuras). */
function periodBounds(preset: PeriodPreset): { start: Date; end: Date } {
  const now = new Date();
  const todayEnd = endOfDay(now);

  switch (preset) {
    case "day":
      return { start: startOfDay(now), end: todayEnd };
    case "week": {
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const start = new Date(now);
      start.setDate(now.getDate() + mondayOffset);
      start.setHours(0, 0, 0, 0);
      const sunday = new Date(start);
      sunday.setDate(start.getDate() + 6);
      const weekEnd = endOfDay(sunday);
      return {
        start,
        end: minDate(weekEnd, todayEnd),
      };
    }
    case "month": {
      const start = startOfMonth(now);
      return { start, end: minDate(endOfMonth(now), todayEnd) };
    }
    case "quarter": {
      const start = startOfQuarter(now);
      return { start, end: minDate(endOfQuarter(now), todayEnd) };
    }
    case "semester": {
      const start = startOfSemester(now);
      return { start, end: minDate(endOfSemester(now), todayEnd) };
    }
    case "year": {
      const start = startOfYear(now);
      return { start, end: minDate(endOfYear(now), todayEnd) };
    }
  }
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function metaStr(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Primeiro segmento do nome («Produto — cor / tam» da API). */
function productModelFromLineName(productName: string): string {
  const m = productName.match(/^(.+?)\s+[—–-]\s+/);
  if (m?.[1]) return m[1].trim();
  const t = productName.trim();
  return t ? t : "—";
}

function tipoLabelFromLine(line: {
  productName: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const gt = metaStr(line.metadata, "garmentType");
  if (gt) {
    const lbl = labelForDesignTemplateGarment(gt);
    return lbl ?? gt;
  }
  const { caption } = previewAppearanceFromProductName(line.productName);
  const first = caption.split(" · ")[0]?.trim();
  return first && first.length > 0 ? first : "Outro";
}

function modeloMarcaLabelFromLine(line: {
  productName: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const code = metaStr(line.metadata, "productCode");
  const brandId = metaStr(line.metadata, "brandId");
  const brand = brandId ? labelForApparelBrandId(brandId) : "";
  const model =
    (code && code.trim()) || productModelFromLineName(line.productName);
  if (brand && model) return `${model} · ${brand}`;
  if (brand) return brand;
  const m = model.trim().slice(0, 56);
  return m.length > 0 ? m : "Sem detalhe";
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  day: "Diário",
  week: "Semanal",
  month: "Mensal",
  quarter: "Trimestral",
  semester: "Semestral",
  year: "Anual",
};

function ReportGlassCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`group relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-b from-zinc-900/78 via-zinc-900/38 to-black/28 shadow-[0_12px_48px_-18px_rgba(0,0,0,.58)] ring-1 ring-white/[0.04] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-0.5 hover:border-amber-400/[0.22] hover:shadow-[0_22px_60px_-12px_rgba(245,158,11,.18)] motion-reduce:transform-none motion-reduce:transition-none ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-violet-500/[0.07] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl transition-all duration-700 group-hover:bg-amber-400/10" />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

type LoadState = "loading" | "ready" | "error";

export function AdminRelatoriosOverview() {
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [financeRefreshing, setFinanceRefreshing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [financeErr, setFinanceErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<AdminOrderListRow[]>([]);
  const [insumosDash, setInsumosDash] = useState<InsumosDashboard | null>(null);
  const [financeSummary, setFinanceSummary] = useState<FinanceSalesSummary | null>(
    null,
  );
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [fromIso, setFromIso] = useState(() =>
    isoDateFromDate(startOfMonth(new Date())),
  );
  const [toIso, setToIso] = useState(() => isoDateFromDate(new Date()));
  const [pdfBusy, setPdfBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState<"sales" | "ledger" | null>(null);

  const refreshFinance = useCallback(async () => {
    setFinanceRefreshing(true);
    setFinanceErr(null);
    try {
      const sum = await getFinanceSalesSummary(fromIso, toIso);
      setFinanceSummary(sum);
    } catch (e) {
      setFinanceSummary(null);
      setFinanceErr(
        e instanceof Error ? e.message : "Erro ao carregar resumo financeiro.",
      );
    } finally {
      setFinanceRefreshing(false);
    }
  }, [fromIso, toIso]);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const isRefresh = opts?.refresh === true;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setState("loading");
    }
    setErrMsg(null);
    try {
      const [ordersResult, insumosResult] = await Promise.allSettled([
        adminListOrders(ORDERS_SAMPLE_TAKE, 0, true),
        getInsumosDashboard(),
      ]);

      if (ordersResult.status === "rejected") {
        const e = ordersResult.reason;
        setErrMsg(e instanceof Error ? e.message : "Erro ao carregar dados.");
        setState("error");
        return;
      }

      setOrders(ordersResult.value);
      setInsumosDash(
        insumosResult.status === "fulfilled" ? insumosResult.value : null,
      );
      setState("ready");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Erro ao carregar dados.");
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshFinance();
  }, [refreshFinance]);

  useEffect(() => {
    const { start, end } = periodBounds(preset);
    setFromIso(isoDateFromDate(start));
    setToIso(isoDateFromDate(end));
  }, [preset]);

  const { start, end } = useMemo(
    () => ({
      start: startOfDay(dateFromIsoDate(fromIso)),
      end: endOfDay(dateFromIsoDate(toIso)),
    }),
    [fromIso, toIso],
  );

  const financeCurrency = financeSummary?.currency ?? "AOA";

  const financeLines = useMemo(() => {
    if (!financeSummary) return [];
    const lines: { label: string; value: string }[] = [
      {
        label: "Receita (razão)",
        value: formatMoney(financeSummary.totalRevenue, financeCurrency),
      },
      {
        label: "Linhas no período",
        value: String(financeSummary.entryCount),
      },
      {
        label: "Ticket médio (razão)",
        value: formatMoney(financeSummary.avgTicket ?? 0, financeCurrency),
      },
      {
        label: "Balcão",
        value: formatMoney(financeSummary.balcaoRevenue ?? 0, financeCurrency),
      },
      {
        label: "Online",
        value: formatMoney(financeSummary.onlineRevenue ?? 0, financeCurrency),
      },
    ];
    Object.entries(financeSummary.byPaymentMethod).forEach(([k, v]) => {
      lines.push({
        label: `Pagamento · ${paymentLabel(k)}`,
        value: formatMoney(v, financeCurrency),
      });
    });
    return lines;
  }, [financeSummary, financeCurrency]);

  const report = useMemo(() => {
    const createdInPeriod = orders.filter((o) =>
      inRange(o.createdAt, start, end),
    );

    const cancelledInPeriod = createdInPeriod.filter(
      (o) => o.status === "CANCELLED",
    ).length;

    let volumeOrders = 0;
    let grossValue = 0;
    let cancelledValue = 0;
    const byStatus = new Map<string, number>();

    for (const o of createdInPeriod) {
      const amt = parseAmount(o.totalAmount);
      byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
      if (o.status === "CANCELLED") {
        cancelledValue += amt;
        continue;
      }
      volumeOrders += 1;
      grossValue += amt;
    }

    const avgTicket = volumeOrders > 0 ? grossValue / volumeOrders : 0;

    const deliveredInPeriod = orders.filter((o) => {
      if (!o.deliveredAt) return false;
      return inRange(o.deliveredAt, start, end);
    });
    let revenueDelivered = 0;
    for (const o of deliveredInPeriod) {
      revenueDelivered += parseAmount(o.totalAmount);
    }

    const chartEnd = new Date(end);
    let chartStart = new Date(start);
    const spanDays =
      (chartEnd.getTime() - chartStart.getTime()) / 86400000 + 1;
    if (spanDays > 90) {
      chartStart = new Date(chartEnd);
      chartStart.setDate(chartStart.getDate() - 89);
      chartStart.setHours(0, 0, 0, 0);
      if (chartStart < start) chartStart = new Date(start);
    }

    const dayKeys: string[] = [];
    const cursor = new Date(chartStart);
    while (cursor <= chartEnd && dayKeys.length < 120) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const day = String(cursor.getDate()).padStart(2, "0");
      dayKeys.push(`${y}-${m}-${day}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    const createdPerDay = new Map<string, number>();
    for (const k of dayKeys) createdPerDay.set(k, 0);

    const trendSource = createdInPeriod.filter((o) =>
      inRange(o.createdAt, chartStart, chartEnd),
    );

    for (const o of trendSource) {
      const k = dateKeyLocal(o.createdAt);
      if (createdPerDay.has(k)) {
        createdPerDay.set(k, (createdPerDay.get(k) ?? 0) + 1);
      }
    }
    const trendCreated = dayKeys.map((k) => ({
      dia: formatShortDay(k),
      pedidos: createdPerDay.get(k) ?? 0,
    }));

    const statusBars = [...byStatus.entries()]
      .map(([status, count]) => ({
        estado: orderStatusLabel(status),
        quantidade: count,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const clientTotals = new Map<
      string,
      { name: string; email: string; total: number; count: number }
    >();
    for (const o of createdInPeriod) {
      if (o.status === "CANCELLED") continue;
      const id = o.client.id;
      const prev = clientTotals.get(id);
      const amt = parseAmount(o.totalAmount);
      if (!prev) {
        clientTotals.set(id, {
          name: o.client.name,
          email: o.client.email,
          total: amt,
          count: 1,
        });
      } else {
        prev.total += amt;
        prev.count += 1;
      }
    }
    const topClients = [...clientTotals.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    const garmentQty = new Map<string, number>();
    const modeloMarcaQty = new Map<string, number>();
    let mixUnits = 0;
    let activeOrdersInPeriodSansCancel = 0;
    let ordersMissingLinesField = false;

    for (const o of createdInPeriod) {
      if (o.status === "CANCELLED") continue;
      activeOrdersInPeriodSansCancel += 1;
      if (o.items === undefined) {
        ordersMissingLinesField = true;
        continue;
      }
      for (const line of o.items) {
        const q =
          typeof line.quantity === "number" &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0
            ? line.quantity
            : 1;
        mixUnits += q;
        const tipo = tipoLabelFromLine(line);
        garmentQty.set(tipo, (garmentQty.get(tipo) ?? 0) + q);
        const combo = modeloMarcaLabelFromLine(line);
        modeloMarcaQty.set(combo, (modeloMarcaQty.get(combo) ?? 0) + q);
      }
    }

    const garmentTypeBars = [...garmentQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, quantidade]) => ({ tipo, quantidade }));

    const modeloMarcaBars = [...modeloMarcaQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([combinado, quantidade]) => ({ combinado, quantidade }));

    const catalogMixCaption =
      activeOrdersInPeriodSansCancel === 0
        ? null
        : ordersMissingLinesField
          ? "Recarregue os dados ou actualize a app: não foi possível obter linhas de artigo."
          : mixUnits === 0
            ? "Sem linhas de artigo nos pedidos activos deste período (na amostra)."
            : null;

    return {
      createdCount: createdInPeriod.length,
      cancelledInPeriod,
      cancelRate:
        createdInPeriod.length > 0
          ? cancelledInPeriod / createdInPeriod.length
          : 0,
      grossValue,
      avgTicket,
      revenueDelivered,
      deliveredCount: deliveredInPeriod.length,
      trendCreated,
      statusBars,
      topClients,
      cancelledValue,
      trendCaption:
        (chartEnd.getTime() - chartStart.getTime()) / 86400000 + 1 > 90
          ? "Período longo — visualização truncada aos últimos 90 dias."
          : null,
      garmentTypeBars,
      modeloMarcaBars,
      catalogMixCaption,
    };
  }, [orders, start, end]);

  const currency =
    orders.find((o) => o.currency)?.currency ?? "AOA";

  async function handleDownloadSalesCsv() {
    setFinanceErr(null);
    setCsvBusy("sales");
    try {
      const blob = await downloadFinanceSalesCsv(fromIso, toIso);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vendas-razao_${fromIso}_${toIso}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setFinanceErr(
        e instanceof Error ? e.message : "Erro ao exportar CSV de vendas.",
      );
    } finally {
      setCsvBusy(null);
    }
  }

  async function handleDownloadLedgerCsv() {
    setFinanceErr(null);
    setCsvBusy("ledger");
    try {
      const blob = await downloadFinanceLedgerCsv(fromIso, toIso);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `razao-completo_${fromIso}_${toIso}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setFinanceErr(
        e instanceof Error ? e.message : "Erro ao exportar CSV da razão.",
      );
    } finally {
      setCsvBusy(null);
    }
  }

  async function handleExportPdf() {
    if (state !== "ready") return;
    setPdfBusy(true);
    try {
      await downloadRelatorioVendasPdf({
        generatedAt: new Date().toLocaleString("pt-PT"),
        periodLabel: PERIOD_LABELS[preset],
        periodRangeText: `${start.toLocaleDateString("pt-PT")} — ${end.toLocaleDateString("pt-PT")}`,
        currency,
        kpis: {
          createdCount: report.createdCount,
          cancelRatePct: `${(report.cancelRate * 100).toFixed(1)} %`,
          cancelledCount: report.cancelledInPeriod,
          grossValueFmt: formatMoney(report.grossValue, currency),
          avgTicketFmt: formatMoney(report.avgTicket, currency),
          deliveredCount: report.deliveredCount,
          revenueDeliveredFmt: formatMoney(report.revenueDelivered, currency),
          cancelledValueFmt: formatMoney(report.cancelledValue, currency),
        },
        trendCaption: report.trendCaption,
        trendRows: report.trendCreated,
        statusBars: report.statusBars,
        topClients: report.topClients.map((c) => ({
          name: c.name,
          email: c.email,
          count: c.count,
          totalFmt: formatMoney(c.total, currency),
        })),
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Malha decorativa */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(251,191,36,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(251,191,36,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {/* Cabeçalho */}
      <div
        className="animate-report-fade-up relative mb-8 overflow-hidden rounded-[1.75rem] border border-white/[0.1] bg-gradient-to-br from-zinc-900/95 via-zinc-900/70 to-amber-950/35 px-5 py-7 shadow-[0_24px_80px_-24px_rgba(0,0,0,.55)] ring-1 ring-amber-400/10 sm:px-8 sm:py-9"
        style={{ animationDelay: "0ms" }}
      >
        <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-violet-600/15 blur-[100px] animate-report-float-1" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-amber-500/20 blur-[90px] animate-report-float-2" />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent animate-report-shimmer"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, rgba(251,191,36,0.5), transparent)",
          }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-400/90">
              Operação
            </p>
            <h1 className="mt-2 bg-gradient-to-r from-white via-zinc-100 to-amber-200/90 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              Relatórios de vendas
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Receita e razão via API de finanças (período De/Até). KPIs operacionais
              (tendências, fases, catálogo, clientes) derivados dos últimos{" "}
              {ORDERS_SAMPLE_TAKE} pedidos em memória. Resumo de armazém (insumos activos
              e custo total do stock).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state !== "ready" || pdfBusy}
              onClick={() => void handleExportPdf()}
              className="rounded-xl border border-amber-400/35 bg-amber-400/12 px-4 py-2.5 text-xs font-semibold text-amber-100 shadow-[0_0_24px_-8px_rgba(251,191,36,.45)] transition-all duration-300 hover:border-amber-300/50 hover:bg-amber-400/22 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {pdfBusy ? "A gerar PDF…" : "Exportar PDF"}
            </button>
            <button
              type="button"
              disabled={refreshing || financeRefreshing}
              onClick={() => {
                void load({ refresh: state === "ready" });
                void refreshFinance();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:border-amber-400/30 hover:bg-amber-500/12 hover:text-amber-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing || financeRefreshing ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-amber-400" />
              ) : null}
              {refreshing || financeRefreshing ? "A actualizar…" : "Actualizar dados"}
            </button>
            <Link
              href={ROUTES.admin.financeiro}
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/45 hover:bg-emerald-400/18"
            >
              Finanças →
            </Link>
            <Link
              href={ROUTES.admin.pedidos}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all duration-300 hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-400/35 active:scale-[0.97]"
            >
              Ir para pedidos
            </Link>
          </div>
        </div>

        {/* Período */}
        <div className="relative mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_ORDER.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                style={{ animationDelay: `${120 + i * 45}ms` }}
                className={`animate-report-fade-up rounded-full px-4 py-2 text-xs font-medium transition-all duration-300 active:scale-95 ${
                  preset === p
                    ? "scale-[1.02] bg-gradient-to-r from-amber-400/25 to-amber-500/15 text-amber-50 shadow-[0_0_28px_-6px_rgba(251,191,36,.55)] ring-2 ring-amber-400/50"
                    : "border border-white/[0.08] bg-zinc-950/30 text-zinc-500 hover:border-amber-400/25 hover:bg-white/[0.06] hover:text-zinc-200"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                De
              </label>
              <input
                type="date"
                value={fromIso}
                onChange={(e) => setFromIso(e.target.value)}
                className="mt-1 rounded-xl border border-white/[0.12] bg-zinc-950/50 px-3 py-2 text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Até
              </label>
              <input
                type="date"
                value={toIso}
                onChange={(e) => setToIso(e.target.value)}
                className="mt-1 rounded-xl border border-white/[0.12] bg-zinc-950/50 px-3 py-2 text-xs text-zinc-100"
              />
            </div>
            <button
              type="button"
              disabled={csvBusy !== null}
              onClick={() => void handleDownloadSalesCsv()}
              className="rounded-xl border border-amber-400/35 bg-amber-400/12 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/22 disabled:opacity-50"
            >
              {csvBusy === "sales" ? "A exportar…" : "CSV vendas"}
            </button>
            <button
              type="button"
              disabled={csvBusy !== null}
              onClick={() => void handleDownloadLedgerCsv()}
              className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-amber-400/25 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {csvBusy === "ledger" ? "A exportar…" : "CSV razão"}
            </button>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/20 px-3 py-1.5 text-[11px] text-zinc-500 backdrop-blur-sm">
              {financeRefreshing ? (
                <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border border-zinc-500 border-t-emerald-400" />
              ) : (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/80" />
              )}
              {start.toLocaleDateString("pt-PT")} — {end.toLocaleDateString("pt-PT")}
            </span>
          </div>
        </div>
      </div>

      {state === "loading" ? (
        <>
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="relative h-32 overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-900/50"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="animate-report-shimmer absolute inset-0 bg-gradient-to-r from-zinc-800/40 via-zinc-700/30 to-zinc-800/40 opacity-80" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid animate-pulse gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={`arm-${i}`}
              className="relative h-32 overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-900/50"
              style={{ animationDelay: `${400 + i * 100}ms` }}
            >
              <div className="animate-report-shimmer absolute inset-0 bg-gradient-to-r from-zinc-800/40 via-zinc-700/30 to-zinc-800/40 opacity-80" />
            </div>
          ))}
        </div>
        </>
      ) : state === "error" ? (
        <div
          className="animate-report-fade-up rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/40 to-zinc-950/60 px-6 py-10 text-center shadow-[0_20px_60px_-20px_rgba(239,68,68,.25)] backdrop-blur-md"
        >
          <p className="text-sm text-red-100/90">{errMsg}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 transition-transform active:scale-[0.97]"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {financeErr ? (
            <div
              className="animate-report-fade-up mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90"
              role="alert"
            >
              {financeErr}
            </div>
          ) : null}

          <ReportGlassCard
            className="animate-report-fade-up mb-6 p-5"
            style={{ animationDelay: "40ms" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                  Finanças · razão
                </p>
                <h2 className="mt-1 text-base font-semibold text-white">
                  Receita e métodos de pagamento
                </h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Dados completos do período (API de finanças), independentemente da
                  amostra de pedidos abaixo.
                </p>
              </div>
              <Link
                href={ROUTES.admin.financeiro}
                className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/40"
              >
                Ver em Finanças →
              </Link>
            </div>
            {financeSummary &&
            (financeSummary.entryCount > 0 || financeSummary.totalRevenue > 0) ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {financeLines.map((row) => (
                  <li
                    key={row.label}
                    className="flex justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-500">{row.label}</span>
                    <span className="font-mono font-semibold tabular-nums text-zinc-100">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : financeRefreshing ? (
              <p className="mt-4 text-xs text-zinc-500">A carregar resumo financeiro…</p>
            ) : (
              <p className="mt-4 text-xs text-zinc-500">
                Sem movimentos financeiros no período seleccionado.
              </p>
            )}
          </ReportGlassCard>

          <div
            className="animate-report-fade-up mb-6 rounded-2xl border border-amber-400/20 bg-amber-950/20 px-4 py-3 text-[11px] leading-relaxed text-amber-100/85"
            style={{ animationDelay: "60ms" }}
          >
            <span className="font-semibold text-amber-200">Amostra operacional:</span>{" "}
            gráficos, clientes e mix de catálogo usam os últimos{" "}
            <span className="font-semibold tabular-nums">{orders.length}</span> pedidos
            (máx. {ORDERS_SAMPLE_TAKE}). Pedidos mais antigos fora desta lista não entram
            nesses indicadores — use a secção Finanças ou exporte CSV para histórico
            completo.
          </div>

          {/* KPIs operacionais (amostra) */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                delay: 80,
                label: "Pedidos criados no período",
                value: String(report.createdCount),
                hint: (
                  <>
                    Inclui cancelados · Taxa cancelamento{" "}
                    {(report.cancelRate * 100).toFixed(1)}%
                  </>
                ),
                valueClass:
                  "text-2xl font-bold tabular-nums text-white drop-shadow-[0_0_20px_rgba(255,255,255,.12)]",
                panelClass:
                  "from-amber-500/[0.15] ring-amber-400/15",
              },
              {
                delay: 150,
                label: "Valor pedidos activos (no período)",
                value: formatMoney(report.grossValue, currency),
                hint: (
                  <>
                    Exclui cancelados · Ticket médio{" "}
                    {formatMoney(report.avgTicket, currency)}
                  </>
                ),
                valueClass:
                  "text-2xl font-bold tabular-nums text-emerald-300",
                panelClass:
                  "from-emerald-500/[0.12] ring-emerald-400/10",
              },
              {
                delay: 220,
                label: "Entregues no período (data de entrega)",
                value: String(report.deliveredCount),
                hint: (
                  <>
                    Por <span className="text-zinc-400">deliveredAt</span> · Receita
                    associada{" "}
                    <span className="font-semibold text-zinc-200">
                      {formatMoney(report.revenueDelivered, currency)}
                    </span>
                  </>
                ),
                valueClass:
                  "text-2xl font-bold tabular-nums text-sky-300",
                panelClass: "from-sky-500/[0.12] ring-sky-400/10",
              },
              {
                delay: 290,
                label:
                  "Cancelamentos (pedidos criados no período)",
                value: String(report.cancelledInPeriod),
                hint: (
                  <>
                    Valor em pedidos cancelados ·{" "}
                    {formatMoney(report.cancelledValue, currency)}
                  </>
                ),
                valueClass:
                  "text-2xl font-bold tabular-nums text-red-300/95",
                panelClass: "from-red-500/[0.10] ring-red-400/10",
              },
            ].map((kpi) => (
              <ReportGlassCard
                key={kpi.label}
                style={{ animationDelay: `${kpi.delay}ms` }}
                className={`animate-report-fade-up bg-gradient-to-br ${kpi.panelClass} via-transparent to-transparent p-5 ring-1`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {kpi.label}
                </p>
                <p className={`mt-2 ${kpi.valueClass}`}>{kpi.value}</p>
                <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                  {kpi.hint}
                </p>
              </ReportGlassCard>
            ))}
          </div>

          {/* Armazém · insumos (mesma API que o painel de controlo) */}
          {insumosDash ? (
            <div className="mb-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400/90">
                    Armazém
                  </p>
                  <h2 className="mt-1 text-base font-semibold tracking-tight text-white">
                    Insumos e stock
                  </h2>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Dados actuais do catálogo (não filtrados pelo período de vendas).
                  </p>
                </div>
                <Link
                  href={ROUTES.admin.insumos}
                  className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-400/18"
                >
                  Stock · insumos →
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReportGlassCard
                  className="animate-report-fade-up bg-gradient-to-br from-zinc-500/[0.12] via-transparent to-transparent p-5 ring-1 ring-zinc-400/10"
                  style={{ animationDelay: "360ms" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Insumos activos
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-white drop-shadow-[0_0_20px_rgba(255,255,255,.08)]">
                    {String(insumosDash.total)}
                  </p>
                  <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                    Itens activos no catálogo de stock
                  </p>
                </ReportGlassCard>
                <ReportGlassCard
                  className="animate-report-fade-up bg-gradient-to-br from-sky-500/[0.12] via-transparent to-transparent p-5 ring-1 ring-sky-400/10"
                  style={{ animationDelay: "430ms" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Custo total do stock
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-sky-300">
                    {formatMoney(
                      parseAmount(insumosDash.custoTotalStock ?? "0"),
                      "AOA",
                    )}
                  </p>
                  <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                    Σ (unidades × custo unitário)
                  </p>
                </ReportGlassCard>
              </div>
            </div>
          ) : (
            <ReportGlassCard
              className="animate-report-fade-up mb-8 p-4"
              style={{ animationDelay: "360ms" }}
            >
              <p className="text-xs font-semibold text-zinc-400">
                Resumo de insumos indisponível
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Erro de rede ou sem permissão para o armazém. Os indicadores de
                vendas abaixo mantêm-se disponíveis.
              </p>
            </ReportGlassCard>
          )}

          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-400/90">
                Visualização de dados
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
                Tendências, fases e catálogo
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-500">
                Gráficos derivados dos{" "}
                <span className="font-semibold text-zinc-400">{orders.length}</span>{" "}
                pedidos em memória e do intervalo{" "}
                <span className="tabular-nums text-zinc-400">
                  {start.toLocaleDateString("pt-PT")} — {end.toLocaleDateString("pt-PT")}
                </span>
                <span className="text-zinc-600"> ({PERIOD_LABELS[preset]})</span>.
              </p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <ReportGlassCard
              className="animate-report-fade-up xl:col-span-3 p-5"
              style={{ animationDelay: "360ms" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,.8)]" />
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Novos pedidos por dia
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Contagem pela data de criação no intervalo visualizado no gráfico.
                {report.trendCaption ? (
                  <>
                    {" "}
                    <span className="text-amber-200/85">{report.trendCaption}</span>
                  </>
                ) : null}
              </p>
              <div className="mt-4 h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.trendCreated}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="dia"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background:
                          "linear-gradient(165deg, rgb(24 24 27 / 0.95), rgb(9 9 11 / 0.98))",
                        border: "1px solid rgba(251,191,36,0.2)",
                        borderRadius: "14px",
                        fontSize: "12px",
                        boxShadow:
                          "0 12px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
                      }}
                      labelStyle={{ color: "#fde68a" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <defs>
                      <linearGradient id="relTrendGoldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fcd34d" />
                        <stop offset="100%" stopColor="#d97706" />
                      </linearGradient>
                    </defs>
                    <Bar
                      dataKey="pedidos"
                      name="Pedidos criados"
                      fill="url(#relTrendGoldGrad)"
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                      animationEasing="ease-out"
                      isAnimationActive
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportGlassCard>

            <ReportGlassCard
              className="animate-report-fade-up xl:col-span-2 p-5"
              style={{ animationDelay: "440ms" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,.7)]" />
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Estados (pedidos criados no período)
                </h2>
              </div>
              <div className="mt-4 h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.statusBars}
                    layout="vertical"
                    margin={{ left: 8, right: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: "#71717a", fontSize: 10 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="estado"
                      width={120}
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background:
                          "linear-gradient(165deg, rgb(24 24 27 / 0.95), rgb(9 9 11 / 0.98))",
                        border: "1px solid rgba(56,189,248,0.2)",
                        borderRadius: "14px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "#7dd3fc" }}
                    />
                    <defs>
                      <linearGradient id="relStatusSkyGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                      </linearGradient>
                    </defs>
                    <Bar
                      dataKey="quantidade"
                      fill="url(#relStatusSkyGrad)"
                      radius={[0, 8, 8, 0]}
                      animationDuration={1000}
                      animationEasing="ease-out"
                      isAnimationActive
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ReportGlassCard>
          </div>

          <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-400/85">
                Catálogo na operação
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                Tipos de peça e combinados modelo · marca
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Baseado nas linhas dos pedidos activos criados no período seleccionado.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportGlassCard
              className="animate-report-fade-up p-5"
              style={{ animationDelay: "520ms" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.8)]" />
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Tipos de peça
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Quantidade nas linhas de pedidos activos criados no período (somando
                quantidades por linha).
                {report.catalogMixCaption ? (
                  <>
                    {" "}
                    <span className="text-amber-200/85">
                      {report.catalogMixCaption}
                    </span>
                  </>
                ) : null}
              </p>
              <div className="mt-4 h-[300px] w-full">
                {report.garmentTypeBars.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Sem dados agrupados.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.garmentTypeBars}
                      layout="vertical"
                      margin={{ left: 16, right: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="tipo"
                        width={112}
                        tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background:
                            "linear-gradient(165deg, rgb(24 24 27 / 0.95), rgb(9 9 11 / 0.98))",
                          border: "1px solid rgba(167,139,250,0.25)",
                          borderRadius: "14px",
                          fontSize: "12px",
                        }}
                        labelStyle={{ color: "#ddd6fe" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <defs>
                        <linearGradient id="relGarmentVioletGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#c4b5fd" />
                          <stop offset="100%" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                      <Bar
                        dataKey="quantidade"
                        name="Unidades (linhas)"
                        fill="url(#relGarmentVioletGrad)"
                        radius={[0, 8, 8, 0]}
                        animationDuration={1000}
                        animationEasing="ease-out"
                        isAnimationActive
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ReportGlassCard>

            <ReportGlassCard
              className="animate-report-fade-up p-5"
              style={{ animationDelay: "600ms" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,.75)]" />
                <h2 className="text-sm font-semibold tracking-tight text-white">
                  Modelo e marca
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Código ou nome-base do modelo e marca da grade quando existirem nos
                metadados das linhas. Até 14 etiquetas mais frequentes neste período.
              </p>
              <div className="mt-4 h-[300px] w-full">
                {report.modeloMarcaBars.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Sem dados agrupados.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.modeloMarcaBars}
                      layout="vertical"
                      margin={{ left: 8, right: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="combinado"
                        width={200}
                        tick={{ fill: "#a1a1aa", fontSize: 9 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background:
                            "linear-gradient(165deg, rgb(24 24 27 / 0.95), rgb(9 9 11 / 0.98))",
                          border: "1px solid rgba(251,113,133,0.25)",
                          borderRadius: "14px",
                          fontSize: "12px",
                        }}
                        labelStyle={{ color: "#fecdd3" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <defs>
                        <linearGradient id="relModelRoseGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#fda4af" />
                          <stop offset="100%" stopColor="#e11d48" />
                        </linearGradient>
                      </defs>
                      <Bar
                        dataKey="quantidade"
                        name="Unidades (linhas)"
                        fill="url(#relModelRoseGrad)"
                        radius={[0, 8, 8, 0]}
                        animationDuration={1000}
                        animationEasing="ease-out"
                        isAnimationActive
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ReportGlassCard>
          </div>

          <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">
                Faturação por conta
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                Ranking de clientes por valor
              </p>
            </div>
          </div>

          <ReportGlassCard
            className="animate-report-fade-up mt-6 overflow-hidden p-0"
            style={{ animationDelay: "680ms" }}
          >
            <div className="relative border-b border-white/[0.08] bg-gradient-to-r from-white/[0.04] to-transparent px-4 py-4 sm:px-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Tabela detalhada
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Exclui linhas canceladas; ordenado por valor total estimado nos pedidos da amostra.
              </p>
            </div>
            <div className="overflow-x-auto">
            <div className="relative max-h-[min(52vh,520px)] overflow-auto overscroll-contain">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-zinc-950/[0.97] shadow-[0_6px_16px_rgba(0,0,0,0.35)] backdrop-blur-md">
                    <th className="w-11 px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:px-6">
                      Cliente
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Pedidos
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:px-6">
                      Valor total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {report.topClients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-12 text-center text-xs text-zinc-500"
                      >
                        Sem dados neste período ou só cancelamentos.
                      </td>
                    </tr>
                  ) : (
                    report.topClients.map((row, idx) => (
                      <tr
                        key={`${row.email}-${idx}`}
                        style={{ animationDelay: `${760 + idx * 40}ms` }}
                        className={`animate-report-fade-up transition-colors duration-300 hover:bg-white/[0.04] ${
                          idx % 2 === 1 ? "bg-black/[0.15]" : ""
                        }`}
                      >
                        <td className="px-2 py-3 text-center tabular-nums">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[11px] font-bold text-zinc-400">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <p className="font-medium text-zinc-100">{row.name}</p>
                          <p className="text-[11px] text-zinc-500">{row.email}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                          {row.count}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-300/95 sm:px-6">
                          {formatMoney(row.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </div>
          </ReportGlassCard>

          <p
            className="animate-report-fade-up mt-8 text-center text-[11px] text-zinc-600"
            style={{ animationDelay: "820ms" }}
          >
            Os relatórios combinam a API de finanças (receita/razão no período De/Até) com
            a lista de pedidos (até {ORDERS_SAMPLE_TAKE} por carregamento) e o resumo de
            armazém. Para histórico completo ou reconciliação detalhada, use{" "}
            <Link
              href={ROUTES.admin.financeiro}
              className="font-semibold text-amber-400/90 underline-offset-2 hover:underline"
            >
              Finanças
            </Link>{" "}
            ou exporte CSV.
          </p>
        </>
      )}
    </div>
  );
}
