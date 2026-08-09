"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CashFlowReportApi } from "@/lib/api-client";
import {
  deleteFinanceCashFlowProjection,
  getFinanceCashFlowReport,
  getFinanceTreasuryOpening,
  postFinanceCashFlowExpense,
  postFinanceCashFlowProjection,
  postFinanceCashFlowReceipt,
  upsertFinanceTreasuryOpening,
  type CashFlowGrain,
  type TreasuryOpeningApi,
} from "@/lib/api-client";
import { downloadFinanceCashFlowPdf } from "@/lib/cash-flow-pdf";
import { coerceMoneyOrZero } from "@/lib/coerce-values";
import { formatMoney } from "@/lib/format-money";
import {
  MONEY_DECIMAL_PLACES,
  sanitizeUnsignedDecimalString,
} from "@/lib/numeric-input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: "8px",
    fontSize: "11px",
    color: "#fafafa",
  },
  labelStyle: { color: "#fafafa", fontWeight: 700 },
};

function axisMoneyCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const x = Math.abs(n);
  if (x >= 1_000_000_000) return `${sign}${(x / 1_000_000_000).toFixed(1).replace(".", ",")}G`;
  if (x >= 1_000_000) return `${sign}${(x / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (x >= 1_000) return `${sign}${(x / 1_000).toFixed(1).replace(".", ",")}k`;
  return `${sign}${Math.round(x)}`;
}

function cashFlowGrainPeriodNoun(grain: CashFlowGrain): string {
  if (grain === "daily") return "dia";
  if (grain === "monthly") return "mês";
  return "ano";
}

function cashFlowGrainVistaLabel(grain: CashFlowGrain): string {
  if (grain === "daily") return "Vista diária";
  if (grain === "monthly") return "Vista mensal";
  return "Vista anual";
}



const MIX_LABELS: Record<keyof CashFlowReportApi["paymentBucketsPctOfReceiptMix"], string> =
  {
    DINHEIRO: "Dinheiro",
    TPA: "TPA",
    TRANSFERENCIA: "Transferência",
    OUTROS: "Outros",
  };

export function FinanceCashFlowSection(props: {
  from: string;
  to: string;
  currency: string;
}) {
  const cur = props.currency || "AOA";
  const [grain, setGrain] = useState<CashFlowGrain>("daily");
  const [cfBusy, setCfBusy] = useState(false);
  const [cfErr, setCfErr] = useState<string | null>(null);
  const [report, setReport] = useState<CashFlowReportApi | null>(null);

  const [openingSaved, setOpeningSaved] = useState<TreasuryOpeningApi | null>(null);
  const [openingInput, setOpeningInput] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [openingOverrideInput, setOpeningOverrideInput] = useState("");
  const [openingOverrideUsed, setOpeningOverrideUsed] = useState<
    number | undefined
  >(undefined);

  const [recAmt, setRecAmt] = useState("");
  const [recCat, setRecCat] = useState("");
  const [recDesc, setRecDesc] = useState("");
  const [recRef, setRecRef] = useState("");

  const [expAmt, setExpAmt] = useState("");
  const [expCat, setExpCat] = useState("");
  const [expDesc, setExpDesc] = useState("");

  const [prDate, setPrDate] = useState("");
  const [prDir, setPrDir] = useState<"IN" | "OUT">("IN");
  const [prAmt, setPrAmt] = useState("");
  const [prCat, setPrCat] = useState("");
  const [prDesc, setPrDesc] = useState("");

  const loadTreasuryOpening = useCallback(async () => {
    try {
      const row = await getFinanceTreasuryOpening(props.from);
      setOpeningSaved(row);
      setOpeningNotes(row?.notes ?? "");
      setOpeningInput(
        row?.amount != null
          ? sanitizeUnsignedDecimalString(
              String(row.amount).replace(".", ","),
              MONEY_DECIMAL_PLACES,
            )
          : "",
      );
    } catch {
      setOpeningSaved(null);
    }
  }, [props.from]);

  const loadReport = useCallback(async () => {
    setCfErr(null);
    setCfBusy(true);
    try {
      const r = await getFinanceCashFlowReport({
        from: props.from,
        to: props.to,
        granularity: grain,
        ...(typeof openingOverrideUsed === "number" &&
        Number.isFinite(openingOverrideUsed)
          ? { openingBalanceOverride: openingOverrideUsed }
          : {}),
      });
      setReport(r);
    } catch (e) {
      setReport(null);
      setCfErr(e instanceof Error ? e.message : "Erro ao carregar fluxo de caixa.");
    } finally {
      setCfBusy(false);
    }
  }, [props.from, props.to, grain, openingOverrideUsed]);

  useEffect(() => {
    void loadTreasuryOpening();
  }, [loadTreasuryOpening]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const pieData = useMemo(() => {
    if (!report || report.noteReceiptMixPct || report.salePaymentMixTotal <= 0)
      return [];
    type K = keyof typeof MIX_LABELS;
    const cols: Record<K, string> = {
      DINHEIRO: "#0d9488",
      TPA: "#2563eb",
      TRANSFERENCIA: "#6d28d9",
      OUTROS: "#475569",
    };
    return (["DINHEIRO", "TPA", "TRANSFERENCIA", "OUTROS"] as const).map((k) => ({
      key: k,
      name: MIX_LABELS[k],
      value:
        Math.round(report.paymentBucketsPctOfReceiptMix[k] * 10) / 10,
      amt: report.paymentBucketsReceiptsAbsolute[k],
      color: cols[k],
    })).filter((d) => d.value > 0 || d.amt > 0);
  }, [report]);

  const flowTimelineRows = useMemo(() => {
    if (!report?.periods?.length) return [];
    return report.periods.map((p) => ({
      periodo: p.periodKey,
      entradas: Number(p.receipts),
      saidas: Number(p.payments),
      saldo: Number(p.cumulativeClosing),
      liquido: Number(p.net),
    }));
  }, [report]);

  async function onSaveOpeningBalance() {
    setCfErr(null);
    try {
      const amt = coerceMoneyOrZero(openingInput);
      await upsertFinanceTreasuryOpening({
        snapshotDate: props.from,
        amount: amt,
        notes: openingNotes.trim() || undefined,
      });
      await loadTreasuryOpening();
      await loadReport();
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : "Erro ao gravar saldo inicial.");
    }
  }

  async function onReceipt() {
    setCfErr(null);
    const amt = coerceMoneyOrZero(recAmt || "0");
    if (!(amt >= 0.01)) return setCfErr("Indique valor da entrada.");
    if (recCat.trim().length < 2) return setCfErr("Indique uma categoria.");
    if (recDesc.trim().length < 3)
      return setCfErr("Indique o motivo da entrada (mín. 3 caracteres).");
    setCfBusy(true);
    try {
      await postFinanceCashFlowReceipt({
        amount: amt,
        category: recCat.trim(),
        description: recDesc.trim(),
        reference: recRef.trim() || undefined,
      });
      setRecAmt("");
      setRecDesc("");
      setRecRef("");
      await loadReport();
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : "Erro ao registar entrada.");
    } finally {
      setCfBusy(false);
    }
  }

  async function onExpense() {
    setCfErr(null);
    const amt = coerceMoneyOrZero(expAmt || "0");
    if (!(amt >= 0.01)) return setCfErr("Indique valor da despesa.");
    if (expCat.trim().length < 2) return setCfErr("Indique uma categoria.");
    if (expDesc.trim().length < 3)
      return setCfErr("Indique o motivo da saída (mín. 3 caracteres).");
    setCfBusy(true);
    try {
      await postFinanceCashFlowExpense({
        amount: amt,
        category: expCat.trim(),
        description: expDesc.trim(),
      });
      setExpAmt("");
      setExpDesc("");
      await loadReport();
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : "Erro ao registar despesa.");
    } finally {
      setCfBusy(false);
    }
  }

  async function onProjectionCreate() {
    setCfErr(null);
    const date = prDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setCfErr("Data da previsão inválida.");
    const amt = coerceMoneyOrZero(prAmt || "0");
    if (!(amt >= 0.01)) return setCfErr("Valor da previsão inválido.");
    if (prCat.trim().length < 2) return setCfErr("Categoria obrigatória.");
    if (prDesc.trim().length < 3)
      return setCfErr("Indique o motivo da previsão (mín. 3 caracteres).");
    setCfBusy(true);
    try {
      await postFinanceCashFlowProjection({
        expectedDate: date,
        direction: prDir,
        amount: amt,
        category: prCat.trim(),
        description: prDesc.trim(),
      });
      setPrAmt("");
      setPrDesc("");
      await loadReport();
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : "Erro ao criar previsão.");
    } finally {
      setCfBusy(false);
    }
  }

  async function onDeleteProjection(id: string) {
    if (!confirm("Remover esta previsão?")) return;
    setCfBusy(true);
    try {
      await deleteFinanceCashFlowProjection(id);
      await loadReport();
    } finally {
      setCfBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.05]">
      <div className="flex flex-col gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Fluxo de caixa
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-snug text-zinc-700 dark:text-zinc-400">
            Usa os mesmos «De / Até» dos relatórios acima: entradas e saídas do razão PDV +
            outros recebimentos e despesas manuais, saldo inicial em tesouraria, previsões e
            exportação PDF. Apenas administrador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-400">
            Agregar
          </label>
          <select
            value={grain}
            onChange={(e) => setGrain(e.target.value as CashFlowGrain)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-[10px] font-medium text-zinc-900 shadow-sm outline-none ring-zinc-400/40 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-teal-500/30 dark:focus:ring-teal-500/50"
          >
            <option value="daily">Diário (tesouraria)</option>
            <option value="monthly">Mensal (estratégia)</option>
            <option value="yearly">Anual (panorâmica)</option>
          </select>
          <button
            type="button"
            disabled={cfBusy}
            onClick={() => void loadReport()}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-900 hover:bg-white disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Actualizar fluxo
          </button>
          <button
            type="button"
            disabled={!report || cfBusy}
            onClick={() => report && void downloadFinanceCashFlowPdf(report)}
            className="rounded-md bg-teal-700 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-teal-600 disabled:opacity-45 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            PDF relatório
          </button>
        </div>
      </div>

      {cfErr ? (
        <p
          className="mt-3 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-950 dark:border-red-800 dark:bg-red-950/60 dark:text-red-50"
          role="alert"
        >
          {cfErr}
        </p>
      ) : null}

      {/* ① Contexto: datas e agregação (alinhado aos filtros dos relatórios acima) */}
      <div className="mt-4 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          Período em análise
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {props.from.slice(0, 10)} <span className="text-zinc-500">&rarr;</span>{" "}
            {props.to.slice(0, 10)}
          </span>
          <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
            {cashFlowGrainVistaLabel(grain)}
          </span>
        </div>
      </div>

      {/* ② Resumo — prioridade: saldo final, depois entradas / saídas / inicial / projeções */}
      {!report ? (
        <div className="mt-4 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-6 text-center text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
          {cfBusy ? "A carregar os números do fluxo…" : "Sem dados — verifique período ou actualize."}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
            Resumo do período
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="min-w-0 rounded-xl border-2 border-teal-700/25 bg-teal-50/80 px-2 py-2 shadow-sm ring-1 ring-teal-900/[0.06] dark:border-teal-500/30 dark:bg-teal-950/40 dark:ring-teal-400/10">
              <p className="text-[10px] font-bold uppercase tracking-wide text-teal-950 dark:text-teal-100">
                Saldo ao fim do período
              </p>
              <p
                className="mt-1 break-words font-mono text-sm font-bold leading-tight tracking-tight tabular-nums text-teal-950 sm:text-base dark:text-teal-300"
                title={formatMoney(report.closingBalance, cur)}
              >
                {formatMoney(report.closingBalance, cur)}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-2 shadow-sm dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">
                Entradas
              </p>
              <p
                className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums text-emerald-800 sm:text-base dark:text-emerald-400"
                title={formatMoney(report.totals.receipts, cur)}
              >
                {formatMoney(report.totals.receipts, cur)}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-2 shadow-sm dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">
                Saídas
              </p>
              <p
                className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums text-rose-800 sm:text-base dark:text-rose-400"
                title={formatMoney(report.totals.payments, cur)}
              >
                {formatMoney(report.totals.payments, cur)}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-2 shadow-sm dark:border-zinc-600 dark:bg-zinc-900">
              <p className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">
                Saldo inicial usado
              </p>
              <p
                className="mt-1 break-words font-mono text-sm font-semibold leading-tight tabular-nums text-zinc-950 sm:text-base dark:text-white"
                title={formatMoney(report.openingBalance, cur)}
              >
                {formatMoney(report.openingBalance, cur)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] leading-snug text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200">
            <span className="font-semibold text-zinc-900 dark:text-white">Projeções</span>
            {" · "}No período, líquido previsto{" "}
            <span className="font-mono font-bold tabular-nums text-teal-800 dark:text-teal-400">
              {formatMoney(report.projectionsSummaryInRange.netProjectedInRange, cur)}
            </span>
            {" · "}Até às datas futuras (após hoje):{" "}
            <span className="font-mono font-bold tabular-nums text-zinc-900 dark:text-white">
              {formatMoney(report.futureProjectionsNetFromToday, cur)}
            </span>
          </div>
        </div>
      )}

      {/* ③ Detalhe por período (tabela) */}
      {report?.periods.length ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
            Movimento por {cashFlowGrainPeriodNoun(grain)}
          </h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-600">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead className="bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
                <tr>
                  <th className="px-2 py-1.5 text-[10px] font-bold">Período</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold">Entradas</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold">Saídas</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold">Líquido</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold">Saldo acumul.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {report.periods.map((row, i) => (
                  <tr
                    key={row.periodKey}
                    className={
                      i % 2 === 0 ? "bg-white dark:bg-zinc-950" : "bg-zinc-50 dark:bg-zinc-900/60"
                    }
                  >
                    <td className="px-2 py-1.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {row.periodKey}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-emerald-800 dark:text-emerald-400">
                      {formatMoney(row.receipts, cur)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums text-rose-800 dark:text-rose-400">
                      {formatMoney(row.payments, cur)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {formatMoney(row.net, cur)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] font-bold tabular-nums text-teal-900 dark:text-teal-400">
                      {formatMoney(row.cumulativeClosing, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
            Linhas do razão no período
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
            Cada entrada e saída efectiva aparece aqui com o motivo registado ao criá-la — vendas
            incluem canal, meio de pagamento e referência do pedido; suprimentos e saídas PDV usam a
            justificação digitada na caixa.
          </p>
          <div className="mt-2 max-h-[22rem] overflow-auto rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-600">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="sticky top-0 z-[1] bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
                <tr>
                  <th className="px-2 py-1.5 text-[10px] font-bold">Data/hora</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold">Tipo</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold">Sentido</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-bold">Valor</th>
                  <th className="px-2 py-1.5 text-[10px] font-bold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {(report.ledgerMovements ?? []).length > 0 ? (
                  [...(report.ledgerMovements ?? [])].map((m, i) => (
                    <tr
                      key={m.id}
                      className={
                        i % 2 === 0
                          ? "bg-white dark:bg-zinc-950"
                          : "bg-zinc-50 dark:bg-zinc-900/60"
                      }
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono tabular-nums text-zinc-800 dark:text-zinc-100">
                        {new Date(m.occurredAt).toLocaleString("pt-PT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="max-w-[8rem] px-2 py-1.5 align-top leading-tight font-medium text-zinc-900 dark:text-zinc-100">
                        {m.classification}
                      </td>
                      <td
                        className={`px-2 py-1.5 whitespace-nowrap font-semibold ${m.direction === "IN" ? "text-emerald-800 dark:text-emerald-400" : "text-rose-800 dark:text-rose-400"}`}
                      >
                        {m.direction === "IN" ? "Entrada" : "Saída"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-50">
                        {formatMoney(m.amount, cur)}
                      </td>
                      <td
                        className="max-w-[22rem] px-2 py-1.5 align-top leading-snug text-zinc-800 dark:text-zinc-200"
                        title={m.motive}
                      >
                        {m.motive}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-white dark:bg-zinc-950">
                    <td
                      colSpan={5}
                      className="px-2 py-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400"
                    >
                      Sem movimentos efectivos no período com os filtros actuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ④ Gráficos */}
      {report &&
      (flowTimelineRows.length > 0 ||
        (!!report.noteReceiptMixPct ||
          (!report.noteReceiptMixPct && pieData.length > 0))) ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
            Gráficos
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
            Os dois primeiros usam os mesmos totais por período da tabela; o circular reflecte apenas
            recebimentos de vendas registados no razão.
          </p>

          <div className="mt-3 flex flex-nowrap items-stretch gap-3 overflow-x-auto pb-1">
            {flowTimelineRows.length > 0 ? (
              <>
                <div className="flex h-[236px] w-[clamp(260px,min(340px,92vw),400px)] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50 px-3 pb-2 pt-2 text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100">
                  <h4 className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-50">
                    Entradas vs saídas por período
                  </h4>
                  <div className="min-h-0 min-w-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={flowTimelineRows}
                        margin={{ top: 8, right: 4, left: -10, bottom: 2 }}
                      >
                        <CartesianGrid stroke="#94a3b826" strokeDasharray="4 4" vertical={false} />
                        <XAxis
                          dataKey="periodo"
                          interval={
                            flowTimelineRows.length <= 20
                              ? 0
                              : Math.floor(flowTimelineRows.length / 20)
                          }
                          tick={{ fill: "#64748b", fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                          angle={flowTimelineRows.length > 14 ? -40 : 0}
                          height={flowTimelineRows.length > 14 ? 48 : 24}
                          textAnchor={flowTimelineRows.length > 14 ? "end" : "middle"}
                        />
                        <YAxis
                          tick={{ fill: "#64748b", fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tickFormatter={axisMoneyCompact}
                        />
                        <Tooltip
                          {...CHART_TOOLTIP}
                          formatter={(value: unknown, name: unknown) => [
                            formatMoney(Number(value ?? 0), cur),
                            typeof name === "string" ? name : String(name ?? ""),
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ paddingTop: 4, fontSize: 10, fontWeight: 600 }}
                        />
                        <Bar
                          dataKey="entradas"
                          name="Entradas"
                          fill="#0d9488"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={26}
                        />
                        <Bar
                          dataKey="saidas"
                          name="Saídas"
                          fill="#be123c"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={26}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex h-[236px] w-[clamp(260px,min(340px,92vw),400px)] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50 px-3 pb-2 pt-2 text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100">
                  <h4 className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-50">
                    Saldo acumulado e líquido por período
                  </h4>
                  <div className="min-h-0 min-w-0 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={flowTimelineRows}
                        margin={{ top: 8, right: 0, left: -10, bottom: 2 }}
                      >
                        <CartesianGrid stroke="#94a3b826" strokeDasharray="4 4" vertical={false} />
                        <XAxis
                          dataKey="periodo"
                          interval={
                            flowTimelineRows.length <= 20
                              ? 0
                              : Math.floor(flowTimelineRows.length / 20)
                          }
                          tick={{ fill: "#64748b", fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                          angle={flowTimelineRows.length > 14 ? -40 : 0}
                          height={flowTimelineRows.length > 14 ? 48 : 24}
                          textAnchor={flowTimelineRows.length > 14 ? "end" : "middle"}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: "#0f766e", fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tickFormatter={axisMoneyCompact}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fill: "#7c3aed", fontSize: 9 }}
                          tickLine={false}
                          axisLine={false}
                          width={46}
                          tickFormatter={axisMoneyCompact}
                        />
                        <Tooltip
                          {...CHART_TOOLTIP}
                          formatter={(value: unknown, name: unknown) => [
                            formatMoney(Number(value ?? 0), cur),
                            typeof name === "string" ? name : String(name ?? ""),
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ paddingTop: 4, fontSize: 10, fontWeight: 600 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="saldo"
                          yAxisId="left"
                          name="Saldo acumulado"
                          stroke="#0f766e"
                          strokeWidth={2}
                          dot={{
                            fill: "#0f766e",
                            r: flowTimelineRows.length > 31 ? 0 : 2.5,
                          }}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="liquido"
                          yAxisId="right"
                          name="Líquido do período"
                          stroke="#7c3aed"
                          strokeWidth={1.25}
                          strokeDasharray="5 4"
                          dot={{
                            fill: "#7c3aed",
                            r: flowTimelineRows.length > 31 ? 0 : 1.5,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : null}

            {(!!report.noteReceiptMixPct ||
              (!report.noteReceiptMixPct && pieData.length > 0)) ? (
              <div className="flex h-[236px] w-[clamp(220px,min(290px,88vw),320px)] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50 px-3 pb-1.5 pt-2 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200">
                <h4 className="shrink-0 text-[10px] font-semibold text-zinc-900 dark:text-white">
                  Recebimentos de vendas por meio
                </h4>
                {!report.noteReceiptMixPct && pieData.length > 0 ? (
                  <>
                    <p className="shrink-0 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-zinc-700 dark:text-zinc-300">
                      Percentagens · razão · período
                    </p>
                    <div className="min-h-0 min-w-0 flex-1 pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={36}
                            outerRadius={68}
                            paddingAngle={1}
                          >
                            {pieData.map((e) => (
                              <Cell key={e.key} fill={e.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            {...CHART_TOOLTIP}
                            formatter={(value, _name, item) => [
                              `${String(value ?? "")}% (${formatMoney(
                                Number((item?.payload as { amt?: unknown })?.amt ?? 0),
                                cur,
                              )})`,
                              `${(item?.payload as { name?: string }).name ?? ""}`,
                            ]}
                          />
                          <Legend
                            wrapperStyle={{
                              paddingTop: 2,
                              fontSize: 9,
                              fontWeight: 600,
                              color: "inherit",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <p className="mt-auto mb-auto shrink-0 rounded-md border border-amber-300 bg-amber-50 px-2 py-2 text-[10px] leading-snug font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50">
                    {report.noteReceiptMixPct}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ⑤ Lista de previsões (leitura) */}
      {report && report.projections.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
            Previsões no período
          </h3>
          <ul className="mt-2 space-y-1.5">
            {report.projections.map((px) => {
              const pxMotivo =
                px.description && px.description.trim().length >= 1
                  ? px.description.trim()
                  : "(Sem descrição guardada)";
              return (
              <li
                key={px.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] shadow-sm dark:border-zinc-600 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {px.expectedDate}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {px.direction === "IN" ? "Entrada" : "Saída"}
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {px.category}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-teal-800 dark:text-teal-400">
                    {formatMoney(px.amount, cur)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDeleteProjection(px.id)}
                    className="rounded border border-red-300 bg-white px-2 py-0.5 text-[10px] font-bold text-red-800 shadow-sm hover:bg-red-50 dark:border-red-800 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Remover
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-snug text-zinc-700 dark:text-zinc-300">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">Motivo: </span>
                  <span title={pxMotivo}>{pxMotivo}</span>
                </p>
              </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ⑥ Parâmetros de tesouraria (menos urgente para leitura) */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-600 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
          Saldo inicial em tesouraria
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
          Gravado em base de dados para <span className="font-mono font-semibold">{props.from.slice(0, 10)}</span>.
          Opcionalmente substitua apenas no relatório sem gravar.
        </p>
        <div className="mt-2 flex flex-nowrap items-end gap-x-2 gap-y-2 overflow-x-auto pb-1">
          <div className="flex min-w-0 shrink-0 flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-200">
              Montante gravado ({cur})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={openingInput}
              onChange={(e) =>
                setOpeningInput(
                  sanitizeUnsignedDecimalString(e.target.value, MONEY_DECIMAL_PLACES),
                )
              }
              className="w-[7.75rem] rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 outline-none ring-zinc-400/30 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white dark:focus:ring-teal-500/40"
            />
          </div>
          <button
            type="button"
            disabled={cfBusy}
            onClick={() => void onSaveOpeningBalance()}
            className="shrink-0 rounded-md bg-zinc-900 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-teal-500 dark:text-zinc-950 dark:hover:bg-teal-400"
          >
            Gravar saldo
          </button>

          <div className="flex min-w-[10rem] max-w-[14rem] flex-1 flex-col gap-0.5 sm:max-w-[18rem]">
            <label className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-200">
              Notas internas
            </label>
            <textarea
              value={openingNotes}
              onChange={(e) => setOpeningNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="min-h-[2.5rem] w-full resize-y rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none ring-zinc-400/25 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
            />
          </div>

          <div
            className="mx-0.5 hidden h-14 shrink-0 self-end border-l border-zinc-200 md:block dark:border-zinc-700"
            aria-hidden
          />

          <div className="flex shrink-0 flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-200">
              Substituir só no relatório
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={openingOverrideInput}
              onChange={(e) =>
                setOpeningOverrideInput(
                  sanitizeUnsignedDecimalString(e.target.value, MONEY_DECIMAL_PLACES),
                )
              }
              className="w-[7.75rem] rounded-md border border-amber-400/90 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 outline-none ring-amber-500/25 focus:ring-2 dark:border-amber-600 dark:bg-zinc-950 dark:text-white"
            />
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border-2 border-amber-600 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-950 hover:bg-amber-100 dark:bg-amber-950/70 dark:text-amber-100 dark:hover:bg-amber-900"
            onClick={() => {
              if (openingOverrideInput.trim() === "") {
                setOpeningOverrideUsed(undefined);
                return;
              }
              const v = coerceMoneyOrZero(openingOverrideInput);
              setOpeningOverrideUsed(v >= 0 && Number.isFinite(v) ? v : undefined);
            }}
          >
            Aplicar
          </button>
          <button
            type="button"
            className="shrink-0 pb-1.5 text-left text-[10px] font-medium whitespace-nowrap text-teal-800 underline underline-offset-2 hover:text-teal-950 dark:text-teal-300 dark:hover:text-teal-200"
            onClick={() => {
              setOpeningOverrideInput("");
              setOpeningOverrideUsed(undefined);
            }}
          >
            Limpar substituição
          </button>
        </div>

        {openingSaved ? (
          <p className="mt-3 text-[10px] text-zinc-600 dark:text-zinc-400">
            Último registo tesouraria:{" "}
            <span className="font-mono">
              {new Date(openingSaved.updatedAt).toLocaleString("pt-PT")}
            </span>
            .
          </p>
        ) : null}
      </div>

      {/* ⑦ Movimentação manual e nova previsão */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
          Registar movimento ou previsão
        </h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border-y border-r border-zinc-200 border-l-[3px] border-l-emerald-600 bg-white p-3 shadow-sm dark:border-y-zinc-600 dark:border-r-zinc-600 dark:border-l-emerald-500 dark:bg-zinc-900">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:text-emerald-100">
            Outra entrada (recebimento manual)
          </h4>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor"
            value={recAmt}
            onChange={(e) =>
              setRecAmt(
                sanitizeUnsignedDecimalString(e.target.value, MONEY_DECIMAL_PLACES),
              )
            }
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 outline-none ring-emerald-500/20 placeholder:text-zinc-500 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500"
          />
          <input
            placeholder="Categoria (ex.: aporte sócio)"
            value={recCat}
            onChange={(e) => setRecCat(e.target.value)}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none ring-emerald-500/15 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500"
          />
          <textarea
            placeholder="Motivo da entrada (obrigatório, min. 3 caracteres)"
            value={recDesc}
            onChange={(e) => setRecDesc(e.target.value)}
            rows={2}
            required
            minLength={3}
            className="mt-2 w-full resize-y rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500"
          />
          <input
            placeholder="Ref. externa (opc.)"
            value={recRef}
            onChange={(e) => setRecRef(e.target.value)}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="button"
            disabled={cfBusy}
            onClick={() => void onReceipt()}
            className="mt-3 w-full rounded-md bg-emerald-700 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Registar entrada
          </button>
        </div>

        <div className="rounded-lg border-y border-r border-zinc-200 border-l-[3px] border-l-rose-600 bg-white p-3 shadow-sm dark:border-y-zinc-600 dark:border-r-zinc-600 dark:border-l-rose-500 dark:bg-zinc-900">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:text-rose-100">
            Despesa (saída manual)
          </h4>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor"
            value={expAmt}
            onChange={(e) =>
              setExpAmt(
                sanitizeUnsignedDecimalString(e.target.value, MONEY_DECIMAL_PLACES),
              )
            }
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 outline-none ring-rose-500/20 placeholder:text-zinc-500 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <input
            placeholder="Categoria (ex.: rendas)"
            value={expCat}
            onChange={(e) => setExpCat(e.target.value)}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <textarea
            placeholder="Motivo da saída (obrigatório, min. 3 caracteres)"
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            rows={2}
            required
            minLength={3}
            className="mt-2 w-full resize-y rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <button
            type="button"
            disabled={cfBusy}
            onClick={() => void onExpense()}
            className="mt-3 w-full rounded-md bg-rose-700 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-rose-600 disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-500"
          >
            Registar despesa
          </button>
        </div>

        <div className="rounded-lg border-y border-r border-zinc-200 border-l-[3px] border-l-violet-600 bg-white p-3 shadow-sm dark:border-y-zinc-600 dark:border-r-zinc-600 dark:border-l-violet-500 dark:bg-zinc-900">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-zinc-900 dark:text-violet-100">
            Nova previsão (futura)
          </h4>
          <input
            type="date"
            value={prDate}
            onChange={(e) => setPrDate(e.target.value)}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none ring-violet-500/15 focus:ring-2 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <select
            value={prDir}
            onChange={(e) => setPrDir(e.target.value as "IN" | "OUT")}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs font-medium text-zinc-900 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          >
            <option value="IN">Entrada prevista</option>
            <option value="OUT">Saída prevista</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor"
            value={prAmt}
            onChange={(e) =>
              setPrAmt(
                sanitizeUnsignedDecimalString(e.target.value, MONEY_DECIMAL_PLACES),
              )
            }
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <input
            placeholder="Categoria"
            value={prCat}
            onChange={(e) => setPrCat(e.target.value)}
            className="mt-2 w-full rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <textarea
            placeholder="Motivo da previsão (obrigatório, min. 3 caracteres)"
            value={prDesc}
            onChange={(e) => setPrDesc(e.target.value)}
            rows={2}
            required
            minLength={3}
            className="mt-2 w-full resize-y rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-500 dark:border-zinc-500 dark:bg-zinc-950 dark:text-white"
          />
          <button
            type="button"
            disabled={cfBusy}
            onClick={() => void onProjectionCreate()}
            className="mt-3 w-full rounded-md bg-violet-700 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-violet-600 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            Adicionar previsão
          </button>
        </div>
        </div>
      </div>
    </section>
  );
}
