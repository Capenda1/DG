"use client";

import { memo } from "react";
import Link from "next/link";
import type { CounterDraftSummary } from "@/lib/api-client";
import { formatMoney } from "@/lib/format-money";
import { balcaoPdvCard } from "@/lib/balcao-pdv-ui";
import { ROUTES } from "@/lib/routes";

function orderMoneyValue(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  return Number(v) || 0;
}

type Props = {
  pdvCashSessionOpen: boolean | undefined;
  onOpenCashDialog: () => void;
  counterDrafts: CounterDraftSummary[];
  counterDraftsBusy: boolean;
  onRefreshDrafts: () => void;
  activeDraftId: string | null;
  busy: boolean;
  onResumeDraft: (id: string) => void;
  confirmDiscard: (id: string) => void;
};

function BalcaoOperationsPanelInner({
  pdvCashSessionOpen,
  onOpenCashDialog,
  counterDrafts,
  counterDraftsBusy,
  onRefreshDrafts,
  activeDraftId,
  busy,
  onResumeDraft,
  confirmDiscard,
}: Props) {
  return (
    <section className={`${balcaoPdvCard} mb-6`}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* Coluna 1 — Turno de caixa */}
        <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-800/50 dark:bg-amber-950/25">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Turno de caixa
            </h2>
            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              Obrigatório para registar vendas no balcão.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pdvCashSessionOpen === undefined ? (
              <span
                className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-amber-800 dark:border-amber-600 dark:border-t-amber-200"
                aria-label="A verificar caixa"
              />
            ) : pdvCashSessionOpen ? (
              <>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 ring-1 ring-emerald-500/30 dark:text-emerald-300">
                  Aberto
                </span>
                <Link
                  href={ROUTES.admin.caixa}
                  className="text-[11px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300"
                >
                  Fecho / relatórios
                </Link>
              </>
            ) : (
              <>
                <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-700 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300">
                  Fechado
                </span>
                <button
                  type="button"
                  onClick={onOpenCashDialog}
                  className="rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-bold text-black hover:bg-amber-400"
                >
                  Abrir caixa
                </button>
              </>
            )}
          </div>
        </div>

        {/* Coluna 2 — Rascunhos em pausa */}
        <div className="flex min-h-0 flex-col space-y-3 rounded-xl border border-violet-200/80 bg-violet-50/40 p-3.5 dark:border-violet-800/45 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-wide text-violet-800 dark:text-violet-200">
                Rascunhos em pausa
              </h2>
              <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                Pause o pedido e atenda outro; retome aqui quando o cliente
                voltar.
              </p>
            </div>
            <button
              type="button"
              disabled={counterDraftsBusy}
              onClick={onRefreshDrafts}
              className="shrink-0 rounded-lg border border-violet-300/70 bg-white px-2.5 py-1.5 text-[11px] font-bold text-violet-900 hover:bg-violet-50 disabled:opacity-45 dark:border-violet-600 dark:bg-zinc-900 dark:text-violet-200"
            >
              {counterDraftsBusy ? "A actualizar…" : "Actualizar"}
            </button>
          </div>

          {counterDrafts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-violet-300/60 bg-white/70 px-3 py-6 text-center text-xs text-zinc-500 dark:border-violet-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              Nenhum rascunho de balcão em pausa.
            </p>
          ) : (
            <ul className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
              {counterDrafts.map((d) => {
                const isOpen = activeDraftId === d.id;
                const total = orderMoneyValue(d.totalAmount);
                return (
                  <li
                    key={d.id}
                    className="rounded-lg border border-zinc-200/90 bg-white p-2.5 dark:border-zinc-600 dark:bg-zinc-800/80"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {d.orderNumber}
                          {isOpen ? (
                            <span className="ml-1.5 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                              · neste ecrã
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-zinc-700 dark:text-zinc-300">
                          {d.client.name}
                        </p>
                        {d.draftSharedWithDesignTeam ? (
                          <p className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                            Partilhado com design
                          </p>
                        ) : null}
                        <p className="text-[10px] text-zinc-500">
                          {formatMoney(total, d.currency)} ·{" "}
                          {new Date(d.updatedAt).toLocaleString("pt-PT", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busy || isOpen}
                          onClick={() => onResumeDraft(d.id)}
                          className="rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-black disabled:opacity-45"
                        >
                          Retomar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmDiscard(d.id)}
                          className="rounded-lg border border-red-300 px-2.5 py-1 text-[10px] font-bold text-red-700 dark:border-red-800 dark:text-red-400"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export const BalcaoOperationsPanel = memo(BalcaoOperationsPanelInner);
