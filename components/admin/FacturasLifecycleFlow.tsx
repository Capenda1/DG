"use client";

import {
  FACTURA_LIFECYCLE_STAGES,
  type FacturaLifecycleStage,
  type FacturaLifecycleStageId,
} from "@/lib/facturas-lifecycle";

type Props = {
  activeStageId: FacturaLifecycleStageId;
  onSelectStage: (id: FacturaLifecycleStageId) => void;
};

function StageIcon({ stage, active }: { stage: FacturaLifecycleStage; active: boolean }) {
  const ring = active ? "ring-2 ring-amber-400/50" : "ring-1 ring-white/[0.08]";
  const bg = active ? "bg-amber-400/10" : "bg-zinc-900/60";

  if (stage.id === "pro-forma") {
    return (
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${bg} ${ring}`}
        aria-hidden
      >
        <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </div>
    );
  }
  if (stage.id === "factura") {
    return (
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${bg} ${ring}`}
        aria-hidden
      >
        <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${bg} ${ring}`}
      aria-hidden
    >
      <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    </div>
  );
}

export function FacturasLifecycleFlow({ activeStageId, onSelectStage }: Props) {
  return (
    <div className="mb-8">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
        Ciclo de vida do documento
      </p>
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        Fluxo operacional de faturação
      </h2>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[720px] items-stretch gap-0">
          {FACTURA_LIFECYCLE_STAGES.map((stage, index) => {
            const active = stage.id === activeStageId;
            const isLast = index === FACTURA_LIFECYCLE_STAGES.length - 1;

            return (
              <div key={stage.id} className="flex flex-1 items-stretch">
                <button
                  type="button"
                  onClick={() => onSelectStage(stage.id)}
                  className={`group flex flex-1 flex-col rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-amber-400/40 bg-gradient-to-b from-amber-400/12 to-zinc-900/40 shadow-lg shadow-amber-900/20"
                      : "border-white/[0.08] bg-zinc-900/35 hover:border-amber-400/25 hover:bg-zinc-900/55"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <StageIcon stage={stage} active={active} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        active
                          ? "bg-amber-400/20 text-amber-200"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {stage.actionLabel}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">{stage.title}</p>
                  <p className="mt-0.5 text-xs font-medium text-zinc-400">
                    {stage.subtitle}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 group-hover:text-zinc-400">
                    {stage.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!stage.movesStock ? (
                      <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-500">
                        Sem stock
                      </span>
                    ) : null}
                    {stage.editable ? (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-400/90">
                        Editável
                      </span>
                    ) : null}
                    {stage.closedAfterIssue ? (
                      <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-300/90">
                        Fechado após emissão
                      </span>
                    ) : null}
                    {stage.generatesFiscalObligation ? (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300/90">
                        Obrigação fiscal
                      </span>
                    ) : null}
                  </div>
                </button>

                {!isLast ? (
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center px-1">
                    <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                      {stage.transitionToNext}
                    </span>
                    <svg
                      className="h-5 w-5 text-zinc-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        <span className="font-semibold text-zinc-400">Factura-recibo</span> também
        pode ser emitida directamente em vendas a pronto pagamento (balcão), sem
        passar pela factura intermédia. Seleccione a etapa acima para operar.
      </p>
    </div>
  );
}
