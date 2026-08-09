"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadFinanceLedgerCsv,
  downloadFinanceSalesCsv,
  getFinanceBalcaoRetailMargin,
  getFinanceSalesSummary,
  listFinanceLedger,
  PAYMENT_METHOD_LABELS,
  type FinanceBalcaoRetailMargin,
  type FinanceLedgerRow,
  type FinanceSalesSummary,
  type PaymentMethodValue,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { formatMoney } from "@/lib/format-money";
import { ROUTES, contaPedidoPath } from "@/lib/routes";
import { FinanceCashFlowSection } from "./FinanceCashFlowSection";

function todayISODate(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonthISODate(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function numFromApi(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function paymentLabel(code: string): string {
  if (!code) return "—";
  return (
    PAYMENT_METHOD_LABELS[code as PaymentMethodValue] ?? code.replaceAll("_", " ")
  );
}

const PAYMENT_FILTER_KEYS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodValue[];

export default function AdminFinanceiroPage() {
  const [meRole, setMeRole] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [from, setFrom] = useState(firstDayOfMonthISODate);
  const [to, setTo] = useState(todayISODate);
  const [summary, setSummary] = useState<FinanceSalesSummary | null>(null);
  const [ledger, setLedger] = useState<FinanceLedgerRow[] | null>(null);
  const [ledgerPm, setLedgerPm] = useState<string>("");
  const [ledgerOrigin, setLedgerOrigin] = useState<string>("");
  const [margin, setMargin] = useState<FinanceBalcaoRetailMargin | null>(null);

  useEffect(() => {
    setMeRole(loadSession()?.user?.role ?? null);
  }, []);

  const isAdmin = meRole === "ADMIN";

  const ledgerFilters = useMemo(
    () => ({
      ...(ledgerPm ? { paymentMethod: ledgerPm } : {}),
      ...(ledgerOrigin ? { orderOrigin: ledgerOrigin } : {}),
    }),
    [ledgerPm, ledgerOrigin],
  );

  const refreshReports = useCallback(async () => {
    setErr(null);
    setReportsLoading(true);
    try {
      const [sum, led] = await Promise.all([
        getFinanceSalesSummary(from, to),
        listFinanceLedger(from, to, 500, ledgerFilters),
      ]);
      setSummary(sum);
      setLedger(led);
      if (isAdmin) {
        try {
          const m = await getFinanceBalcaoRetailMargin(from, to);
          setMargin(m);
        } catch {
          setMargin(null);
        }
      } else {
        setMargin(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar relatórios.");
    } finally {
      setReportsLoading(false);
    }
  }, [from, to, isAdmin, ledgerFilters]);

  useEffect(() => {
    if (meRole !== "ADMIN") return;
    void refreshReports();
  }, [meRole, refreshReports]);

  const currency = summary?.currency ?? "AOA";

  const summaryLines = useMemo(() => {
    if (!summary) return [];
    const lines: { label: string; value: string }[] = [
      {
        label: "Total (razão)",
        value: formatMoney(summary.totalRevenue, currency),
      },
      { label: "Linhas no período", value: String(summary.entryCount) },
      {
        label: "Ticket médio",
        value: formatMoney(summary.avgTicket ?? 0, currency),
      },
      {
        label: "Balcão (origem)",
        value: formatMoney(summary.balcaoRevenue ?? 0, currency),
      },
      {
        label: "Online (origem)",
        value: formatMoney(summary.onlineRevenue ?? 0, currency),
      },
    ];
    Object.entries(summary.byPaymentMethod).forEach(([k, v]) => {
      lines.push({
        label: `Pagamento · ${paymentLabel(k)}`,
        value: formatMoney(v, currency),
      });
    });
    return lines;
  }, [summary, currency]);

  async function onDownloadSalesCsv() {
    setErr(null);
    try {
      const blob = await downloadFinanceSalesCsv(from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vendas-razao_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao exportar CSV.");
    }
  }

  async function onDownloadLedgerCsv() {
    setErr(null);
    try {
      const blob = await downloadFinanceLedgerCsv(from, to, ledgerFilters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `razao-completo_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao exportar CSV.");
    }
  }

  if (meRole && meRole !== "ADMIN") {
    return (
      <div className="min-h-[40vh] px-4 py-12">
        <p className="mb-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          A área de finanças (razão, relatórios e exportações) é apenas para
          administradores. Para turno de caixa e fechos, use{" "}
          <Link
            href={ROUTES.admin.caixa}
            className="font-semibold text-amber-600 underline dark:text-amber-400"
          >
            Caixa
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Gestão
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Finanças
          </h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Razão após pagamento, fluxo de caixa (entradas/saídas, previsões, PDF),
            reconciliação por período e exportações CSV. Use os filtros «De / Até» nos
            blocos seguintes. O{" "}
            <Link
              href={ROUTES.admin.caixa}
              className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
            >
              caixa PDV
            </Link>{" "}
            (abrir/fechar turno) está noutra página.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link
            href={ROUTES.admin.caixa}
            className="text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
          >
            ← Caixa PDV
          </Link>
          <Link
            href={ROUTES.admin.pedidoBalcao}
            className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
          >
            PDV
          </Link>
        </div>
      </div>

      {err ? (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {err}
        </div>
      ) : null}

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Relatórios
          </h2>
          {reportsLoading ? (
            <span className="text-xs font-medium text-zinc-500">A actualizar…</span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600">De</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600">Até</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </div>
          <button
            type="button"
            disabled={reportsLoading}
            onClick={() => void refreshReports()}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => void onDownloadSalesCsv()}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black shadow-sm transition hover:bg-amber-400"
          >
            CSV vendas
          </button>
          <button
            type="button"
            onClick={() => void onDownloadLedgerCsv()}
            className="rounded-xl border-2 border-amber-500/60 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-amber-500/25 dark:text-amber-100"
          >
            CSV razão completo
          </button>
        </div>

        {summary && (summary.entryCount > 0 || summary.totalRevenue > 0) ? (
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {summaryLines.map((row) => (
              <li
                key={row.label}
                className="flex justify-between gap-4 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <span className="text-zinc-600 dark:text-zinc-400">
                  {row.label}
                </span>
                <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-white">
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        ) : summary ? (
          <p className="mt-4 text-sm text-zinc-500">
            Sem linhas no razão para este período.
          </p>
        ) : null}

        {isAdmin && margin && (margin.revenue > 0 || margin.cost > 0) ? (
          <div className="mt-6 rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/30">
            <h3 className="text-sm font-bold text-violet-900 dark:text-violet-100">
              Margem · retalho ao balcão (insumos)
            </h3>
            <p className="mt-1 text-xs text-violet-800/90 dark:text-violet-200/85">
              Receita e custo estimados pelas linhas de stock (custo unitário no
              cadastro do insumo). Pedidos no período pela data de actualização.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500">Receita</dt>
                <dd className="font-mono font-semibold">
                  {formatMoney(margin.revenue, margin.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Custo</dt>
                <dd className="font-mono font-semibold">
                  {formatMoney(margin.cost, margin.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Margem</dt>
                <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatMoney(margin.margin, margin.currency)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      <FinanceCashFlowSection from={from} to={to} currency={currency} />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Razão · linhas recentes
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Respeita o período acima. Export CSV «razão completo» usa os mesmos
          filtros.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600">
              Método de pagamento
            </label>
            <select
              value={ledgerPm}
              onChange={(e) => setLedgerPm(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              <option value="">Todos</option>
              {PAYMENT_FILTER_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_METHOD_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600">Origem</label>
            <select
              value={ledgerOrigin}
              onChange={(e) => setLedgerOrigin(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              <option value="">Todas</option>
              <option value="BALCAO">Balcão</option>
              <option value="ONLINE">Online</option>
            </select>
          </div>
        </div>

        {ledger && ledger.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-600">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Ref.</th>
                  <th className="py-2 pr-3">Pedido</th>
                  <th className="py-2 pr-3">Valor</th>
                  <th className="py-2 pr-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => {
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-zinc-600">
                        {new Date(row.createdAt).toLocaleString("pt-PT")}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {row.reference ?? "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {row.orderId ? (
                          <Link
                            href={contaPedidoPath(row.orderId)}
                            className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                          >
                            Abrir
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {formatMoney(numFromApi(row.amount), row.currency)}
                      </td>
                      <td className="py-2 pr-3 max-w-[18rem] text-xs leading-snug text-zinc-700 dark:text-zinc-300">
                        {row.motive}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Nenhuma linha com estes filtros.</p>
        )}
      </section>
    </div>
  );
}
