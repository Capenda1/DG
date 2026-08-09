"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  closeFinancePdvSession,
  getFinanceOpenSessionSummary,
  getFinancePdvSessionCurrent,
  listFinancePdvMovementsDuringSession,
  listFinancePdvSessionHistory,
  openFinancePdvSession,
  recordFinancePdvSupplement,
  recordFinancePdvWithdrawal,
  type FinanceOpenSessionSummary,
  type FinancePdvMovementDuringSessionRow,
  type FinancePdvSessionHistoryRow,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import {
  openCashRegisterClosingPrint,
  type PdvCashZReportSnapshot,
} from "@/lib/cash-register-z-print";
import { formatMoney } from "@/lib/format-money";
import {
  coerceFiniteNumber,
  coerceMoneyOrZero,
  formatDisplayText,
  formatIntegerDisplay,
  moneyInputFromUnknown,
} from "@/lib/coerce-values";
import { ROUTES } from "@/lib/routes";
import {
  MONEY_DECIMAL_PLACES,
  sanitizeUnsignedDecimalString,
} from "@/lib/numeric-input";

function parseMoneyInput(s: string): number {
  return coerceMoneyOrZero(s);
}

function isPdvCashZSnapshot(x: unknown): x is PdvCashZReportSnapshot {
  return (
    x != null &&
    typeof x === "object" &&
    "totals" in x &&
    typeof (x as PdvCashZReportSnapshot).totals === "object" &&
    (x as PdvCashZReportSnapshot).totals != null &&
    "expectedCash" in (x as PdvCashZReportSnapshot).totals &&
    typeof (x as PdvCashZReportSnapshot).totals.expectedCash === "number"
  );
}

const CURRENCY_FALLBACK = "AOA";

export default function AdminCaixaPage() {
  const [meRole, setMeRole] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [session, setSession] = useState<Awaited<
    ReturnType<typeof getFinancePdvSessionCurrent>
  > | null | undefined>(undefined);
  const [openSummary, setOpenSummary] = useState<FinanceOpenSessionSummary | null>(
    null,
  );
  const [openFloatInput, setOpenFloatInput] = useState("0");
  const [declaredCashInput, setDeclaredCashInput] = useState("0");
  const [closeNotes, setCloseNotes] = useState("");

  const [ledgerMv, setLedgerMv] = useState<FinancePdvMovementDuringSessionRow[]>(
    [],
  );
  const [supAmt, setSupAmt] = useState("");
  const [supJust, setSupJust] = useState("");
  const [wdAmt, setWdAmt] = useState("");
  const [wdJust, setWdJust] = useState("");

  const [history, setHistory] = useState<FinancePdvSessionHistoryRow[]>([]);

  useEffect(() => {
    setMeRole(loadSession()?.user?.role ?? null);
  }, []);

  const isAdmin = meRole === "ADMIN";

  const loadHistory = useCallback(async () => {
    try {
      const rows = await listFinancePdvSessionHistory(15);
      setHistory(rows);
    } catch {
      setHistory([]);
    }
  }, []);

  const loadSessionData = useCallback(async () => {
    const s = await getFinancePdvSessionCurrent();
    setSession(s);
  }, []);

  const loadLedgerMv = useCallback(async () => {
    try {
      const rows = await listFinancePdvMovementsDuringSession();
      setLedgerMv(rows);
    } catch {
      setLedgerMv([]);
    }
  }, []);

  const refreshOpenSummary = useCallback(async () => {
    if (session === undefined) return;
    if (session == null) {
      setOpenSummary(null);
      return;
    }
    try {
      const s = await getFinanceOpenSessionSummary();
      setOpenSummary(s);
    } catch {
      setOpenSummary(null);
    }
  }, [session]);

  useEffect(() => {
    if (meRole !== "ADMIN" && meRole !== "ATTENDANT") return;
    void loadSessionData();
    if (meRole === "ADMIN") void loadHistory();
    else setHistory([]);
  }, [meRole, loadSessionData, loadHistory]);

  useEffect(() => {
    void refreshOpenSummary();
  }, [refreshOpenSummary]);

  useEffect(() => {
    if (!session) {
      setLedgerMv([]);
      return;
    }
    void loadLedgerMv();
  }, [session, loadLedgerMv]);

  useEffect(() => {
    if (openSummary?.expectedCash == null) return;
    const fromApi = moneyInputFromUnknown(
      openSummary.expectedCash,
      MONEY_DECIMAL_PLACES,
    );
    if (fromApi === "") return;
    setDeclaredCashInput((prev) => {
      if (prev !== "0" && prev !== "") return prev;
      return fromApi;
    });
  }, [openSummary?.sessionId, openSummary?.expectedCash]);

  const currency = CURRENCY_FALLBACK;

  const supTotal =
    openSummary != null ? coerceMoneyOrZero(openSummary.supplementsTotal) : 0;
  const wdAbs =
    openSummary != null ? coerceMoneyOrZero(openSummary.withdrawalsTotalAbs) : 0;

  const declaredPreview = parseMoneyInput(declaredCashInput || "0");

  const expectedCashPreview =
    openSummary != null ? coerceFiniteNumber(openSummary.expectedCash) : null;
  const diffPreview =
    expectedCashPreview != null && Number.isFinite(expectedCashPreview)
      ? Math.round((declaredPreview - expectedCashPreview) * 100) / 100
      : null;

  async function onOpenSession() {
    setErr(null);
    setBusy(true);
    try {
      const v = coerceMoneyOrZero(openFloatInput);
      await openFinancePdvSession(v);
      await loadSessionData();
      if (isAdmin) await loadHistory();
      await loadLedgerMv();
      setDeclaredCashInput("0");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao abrir caixa.");
    } finally {
      setBusy(false);
    }
  }

  async function onCloseSession() {
    setErr(null);
    const v = declaredPreview;
    setBusy(true);
    try {
      const res = await closeFinancePdvSession({
        declaredCash: Number.isFinite(v) ? v : 0,
        closeNotes: closeNotes.trim() || undefined,
      });
      void openCashRegisterClosingPrint(res.closingReport);
      setCloseNotes("");
      await loadSessionData();
      if (isAdmin) await loadHistory();
      setLedgerMv([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao fechar caixa.");
    } finally {
      setBusy(false);
    }
  }

  async function onRecordSupplement() {
    const a = parseMoneyInput(supAmt);
    const j = supJust.trim();
    setErr(null);
    if (a <= 0) {
      setErr("Indique um valor de suprimento maior que zero.");
      return;
    }
    if (j.length < 3) {
      setErr("A justificação do suprimento deve ter pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await recordFinancePdvSupplement(a, j);
      setSupAmt("");
      setSupJust("");
      await refreshOpenSummary();
      await loadLedgerMv();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao registar suprimento.");
    } finally {
      setBusy(false);
    }
  }

  async function onRecordWithdrawal() {
    const a = parseMoneyInput(wdAmt);
    const j = wdJust.trim();
    setErr(null);
    if (a <= 0) {
      setErr("Indique um valor de saída maior que zero.");
      return;
    }
    if (j.length < 3) {
      setErr("A justificação da saída deve ter pelo menos 3 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await recordFinancePdvWithdrawal(a, j);
      setWdAmt("");
      setWdJust("");
      await refreshOpenSummary();
      await loadLedgerMv();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao registar saída.");
    } finally {
      setBusy(false);
    }
  }

  if (meRole && meRole !== "ADMIN" && meRole !== "ATTENDANT") {
    return (
      <div className="min-h-[40vh] px-4 py-12">
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Apenas administrador ou atendente pode aceder ao caixa.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            PDV
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            Caixa
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link
            href={ROUTES.admin.pedidoBalcao}
            className="text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
          >
            ← PDV
          </Link>
          {isAdmin ? (
            <Link
              href={ROUTES.admin.financeiro}
              className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
            >
              Finanças →
            </Link>
          ) : null}
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
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Turno
        </h2>

        {session === undefined ? (
          <p className="mt-4 text-sm text-zinc-500">A carregar…</p>
        ) : session ? (
          <div className="mt-4 space-y-5 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex flex-col gap-0.5 border-b border-emerald-200/60 pb-3 dark:border-emerald-900/40 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Aberto · {new Date(session.openedAt).toLocaleString("pt-PT")}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-200">
                Fundo{" "}
                <span className="font-mono font-bold tabular-nums">
                  {formatMoney(session.openingFloat, currency)}
                </span>
                {" · "}
                {formatDisplayText(session.openedBy?.name)}
              </p>
            </div>

            {openSummary ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-zinc-200/80 bg-white/90 px-3 py-3 text-xs dark:border-zinc-600/70 dark:bg-zinc-950/40 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <dt className="text-zinc-500">Numerário vendas</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatMoney(openSummary.cashSalesTotal, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Outros meios</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatMoney(openSummary.nonCashSalesTotal, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Suprimentos</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-sky-800 dark:text-sky-300">
                    {formatMoney(supTotal, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Saídas</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-rose-800 dark:text-rose-300">
                    {formatMoney(wdAbs, currency)}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-3 lg:col-span-2">
                  <dt className="font-semibold text-amber-900 dark:text-amber-200">
                    Esperado no cofre
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums text-amber-950 dark:text-amber-100">
                    {formatMoney(openSummary.expectedCash, currency)}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1 lg:col-span-1">
                  <dt className="text-zinc-500">Liquidações</dt>
                  <dd className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
                    {formatIntegerDisplay(openSummary.saleCount)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-zinc-500">A carregar totais…</p>
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr,minmax(16rem,22rem)]">
              <div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-600/60 dark:bg-zinc-950/50">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Suprimento e saída
                </h3>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/40 px-3 py-3 dark:border-emerald-800/40 dark:bg-emerald-950/25">
                    <p className="mb-2 text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-200">
                      Suprimento
                    </p>
                    <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                      Valor ({currency})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={supAmt}
                      onChange={(e) =>
                        setSupAmt(
                          sanitizeUnsignedDecimalString(
                            e.target.value,
                            MONEY_DECIMAL_PLACES,
                          ),
                        )
                      }
                      className="mt-0.5 w-full rounded border border-emerald-200 bg-white px-2 py-1.5 text-sm dark:border-emerald-800 dark:bg-zinc-900"
                    />
                    <label className="mt-2 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                      Justificação
                    </label>
                    <input
                      value={supJust}
                      onChange={(e) => setSupJust(e.target.value)}
                      placeholder="Ex.: reforço banco-notas"
                      className="mt-0.5 w-full rounded border border-emerald-200 bg-white px-2 py-1.5 text-sm dark:border-emerald-800 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRecordSupplement()}
                      className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Registar suprimento
                    </button>
                  </div>

                  <div className="rounded-lg border border-rose-200/70 bg-rose-50/40 px-3 py-3 dark:border-rose-900/40 dark:bg-rose-950/25">
                    <p className="mb-2 text-xs font-semibold uppercase text-rose-900 dark:text-rose-200">
                      Saída de numerário
                    </p>
                    <label className="block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                      Valor ({currency})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={wdAmt}
                      onChange={(e) =>
                        setWdAmt(
                          sanitizeUnsignedDecimalString(
                            e.target.value,
                            MONEY_DECIMAL_PLACES,
                          ),
                        )
                      }
                      className="mt-0.5 w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-sm dark:border-rose-900/50 dark:bg-zinc-900"
                    />
                    <label className="mt-2 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                      Justificação
                    </label>
                    <input
                      value={wdJust}
                      onChange={(e) => setWdJust(e.target.value)}
                      placeholder="Ex.: depósito banco troco"
                      className="mt-0.5 w-full rounded border border-rose-200 bg-white px-2 py-1.5 text-sm dark:border-rose-900/50 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRecordWithdrawal()}
                      className="mt-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Registar saída
                    </button>
                  </div>
                </div>

                {ledgerMv.length ? (
                  <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                        <tr>
                          <th className="px-2 py-1 font-semibold">Tipo</th>
                          <th className="px-2 py-1 font-semibold">Quando</th>
                          <th className="px-2 py-1 font-semibold text-right">Valor</th>
                          <th className="px-2 py-1 font-semibold">Justificação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerMv.map((m) => (
                          <tr
                            key={m.id}
                            className="border-t border-zinc-100 dark:border-zinc-800"
                          >
                            <td className="px-2 py-1">
                              {m.side === "supplement"
                                ? "Suprimento"
                                : "Saída"}
                            </td>
                            <td className="px-2 py-1 font-mono text-zinc-500">
                              {new Date(m.createdAt).toLocaleString("pt-PT")}
                            </td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums font-semibold">
                              {formatMoney(m.amount, currency)}
                            </td>
                            <td className="px-2 py-1 text-zinc-700 dark:text-zinc-300">
                              {formatDisplayText(m.justification)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-amber-300/60 bg-white p-4 dark:border-amber-800/40 dark:bg-zinc-950/80 lg:sticky lg:top-4 lg:self-start">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Fecho
                </h3>

                <div className="mt-3 grid gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Numerário contado
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={declaredCashInput}
                    onChange={(e) =>
                      setDeclaredCashInput(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          MONEY_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50/80 px-3 py-2.5 text-xs dark:border-zinc-600 dark:bg-zinc-900/50">
                  {openSummary ? (
                    <>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-zinc-500">Esperado</span>
                        <strong className="font-mono tabular-nums text-amber-900 dark:text-amber-300">
                          {formatMoney(openSummary.expectedCash, currency)}
                        </strong>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-zinc-500">Quebra</span>
                        <strong
                          className={
                            diffPreview === null
                              ? "font-mono text-zinc-500"
                              : diffPreview === 0
                                ? "font-mono text-emerald-700 dark:text-emerald-400"
                                : "font-mono text-rose-700 dark:text-rose-400"
                          }
                        >
                          {diffPreview != null
                            ? `${diffPreview >= 0 ? "+" : ""}${formatMoney(diffPreview, currency)}`
                            : "—"}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="self-start text-[11px] font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-600 dark:text-emerald-300"
                        onClick={() =>
                          setDeclaredCashInput(
                            moneyInputFromUnknown(
                              openSummary.expectedCash,
                              MONEY_DECIMAL_PLACES,
                            ),
                          )
                        }
                      >
                        Preencher com esperado
                      </button>
                    </>
                  ) : (
                    <span className="text-zinc-500">A sincronizar…</span>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Observações (opcional)
                </label>
                <input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void onCloseSession()}
                className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400"
              >
                Fechar turno · relatório Z
              </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Fundo de abertura
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={openFloatInput}
                onChange={(e) =>
                  setOpenFloatInput(
                    sanitizeUnsignedDecimalString(
                      e.target.value,
                      MONEY_DECIMAL_PLACES,
                    ),
                  )
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 sm:w-40"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onOpenSession()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            >
              Abrir turno
            </button>
          </div>
        )}
      </section>

      {isAdmin ? (
      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          Turnos fechados
        </h2>
        {history.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-600">
                  <th className="py-2 pr-2">Fecho</th>
                  <th className="py-2 pr-2">Operadores</th>
                  <th className="py-2 pr-2 text-right">Esperado</th>
                  <th className="py-2 pr-2 text-right">Contado</th>
                  <th className="py-2 pr-2 text-right">Quebra</th>
                  <th className="py-2 pr-2 text-center">Z</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-2 font-mono text-xs text-zinc-600">
                      {h.closedAt
                        ? new Date(h.closedAt).toLocaleString("pt-PT")
                        : "—"}
                    </td>
                    <td className="max-w-[10rem] py-2 pr-2 text-xs text-zinc-600">
                      <span
                        className="block truncate"
                        title={
                          typeof h.openedBy.name === "string"
                            ? h.openedBy.name
                            : undefined
                        }
                      >
                        {formatDisplayText(h.openedBy.name)}
                      </span>
                      <span
                        className="block truncate text-zinc-500"
                        title={
                          typeof h.closedBy?.name === "string"
                            ? h.closedBy.name
                            : undefined
                        }
                      >
                        → {formatDisplayText(h.closedBy?.name)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(h.expectedCash, currency)}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                      {formatMoney(h.declaredCash, currency)}
                    </td>
                    <td
                      className={`py-2 pr-2 text-right font-mono text-xs font-semibold tabular-nums ${
                        coerceMoneyOrZero(h.cashDifference) === 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {formatMoney(h.cashDifference, currency)}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      {isPdvCashZSnapshot(h.closingSnapshot) ? (
                        <button
                          type="button"
                          className="text-[11px] font-bold text-amber-700 underline underline-offset-2 hover:text-amber-600 dark:text-amber-400"
                          onClick={() => {
                            const snap = h.closingSnapshot;
                            if (isPdvCashZSnapshot(snap)) {
                              void openCashRegisterClosingPrint(snap);
                            }
                          }}
                        >
                          Imprimir relatório Z
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Ainda não há turnos fechados.</p>
        )}
      </section>
      ) : null}
    </div>
  );
}
