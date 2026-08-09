"use client";

import { formatMoney } from "@/lib/format-money";

type Subtotals = {
  vestuario: number;
  plano: number;
  lona: number;
  insumos: number;
  total: number;
  currency: string;
};

type Props = {
  clientLabel: string | null;
  subtotals: Subtotals;
  canAdvance: boolean;
  busy: boolean;
  busyAction: null | "continue" | "pause";
  cashTurnBlocking: boolean;
  onContinue: () => void;
  onPause: () => void;
};

export function BalcaoStickyFooter({
  clientLabel,
  subtotals,
  canAdvance,
  busy,
  busyAction,
  cashTurnBlocking,
  onContinue,
  onPause,
}: Props) {
  const { currency } = subtotals;
  const parts: { label: string; value: number }[] = [];
  if (subtotals.vestuario > 0) {
    parts.push({ label: "Vestuário", value: subtotals.vestuario });
  }
  if (subtotals.plano > 0) {
    parts.push({ label: "Plano", value: subtotals.plano });
  }
  if (subtotals.lona > 0) {
    parts.push({ label: "Lona/Vinil", value: subtotals.lona });
  }
  if (subtotals.insumos > 0) {
    parts.push({ label: "Stock", value: subtotals.insumos });
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200/95 bg-white/95 px-3 py-2.5 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-zinc-600 dark:bg-zinc-950/95 dark:shadow-black/40 sm:px-4 sm:py-3"
      role="region"
      aria-label="Resumo e acções do pedido"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            {clientLabel ?? "Cliente — seleccionar ou registo rápido"}
          </p>
          {parts.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {parts.map((p) => (
                <span key={p.label}>
                  {p.label}:{" "}
                  <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {formatMoney(p.value, currency)}
                  </span>
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-extrabold tabular-nums text-zinc-900 dark:text-white">
            Total{" "}
            <span className="text-amber-700 dark:text-amber-400">
              {formatMoney(subtotals.total, currency)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={busy || !canAdvance || cashTurnBlocking}
            onClick={onContinue}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-extrabold text-black shadow-md shadow-amber-600/25 transition hover:from-amber-300 hover:to-orange-400 disabled:pointer-events-none disabled:opacity-45"
          >
            {busyAction === "continue" && busy
              ? "A criar rascunho…"
              : "Continuar para pagamento"}
          </button>
          <button
            type="button"
            disabled={busy || !canAdvance || cashTurnBlocking}
            onClick={onPause}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-bold text-zinc-800 transition hover:border-amber-400/50 disabled:pointer-events-none disabled:opacity-45 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {busyAction === "pause" && busy ? "A guardar…" : "Guardar rascunho"}
          </button>
        </div>
      </div>
    </div>
  );
}
