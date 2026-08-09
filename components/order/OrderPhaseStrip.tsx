import { orderStatusLabel } from "@/lib/order-status";

/** Ordem oficial das fases no fluxo (exclui cancelamento). */
export const PIPELINE_PHASES = [
  "DRAFT",
  "SUBMITTED",
  "VALIDATION_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
  "DELIVERED",
] as const;

export function pipelinePhaseIndex(status: string): number {
  return PIPELINE_PHASES.indexOf(status as (typeof PIPELINE_PHASES)[number]);
}

/** Linha visual das 7 fases — lista (compacta) ou painel de detalhe. */
export function OrderPhaseStrip({
  status,
  compact,
  balcaoInsumosOnly,
}: {
  status: string;
  compact?: boolean;
  /** Só insumos ao balcão: compra imediata; não aplica o fluxo de fases de fabrico. */
  balcaoInsumosOnly?: boolean;
}) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-950/25 px-2 py-1 text-[10px] font-medium text-red-300">
        Pedido cancelado — fluxo interrompido
      </div>
    );
  }

  if (balcaoInsumosOnly) {
    const inner = (
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-2.5 py-2 text-[10px] leading-snug text-emerald-200/95">
        <span className="font-semibold text-emerald-100">
          Venda imediata ao balcão
        </span>
        {" — "}
        apenas materiais/insumos; não há fases de modelagem ou produção téxtil.
        {status === "DRAFT" ? (
          <span className="mt-1 block text-emerald-200/85">
            Ao finalizar o pagamento no PDV, o pedido passa directamente a concluído.
          </span>
        ) : null}
      </div>
    );
    if (compact) return inner;
    return (
      <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-black/35 to-black/20 px-4 py-3 ring-1 ring-white/[0.03]">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Fluxo do pedido
        </p>
        {inner}
        <p className="mt-3 text-center text-[11px] text-zinc-500">
          Estado:{" "}
          <span className="font-medium text-amber-200/90">
            {orderStatusLabel(status)}
          </span>
        </p>
      </div>
    );
  }

  const cur = pipelinePhaseIndex(status);
  const unknown = cur < 0;
  const dotSm = compact ? "h-1.5 w-1.5" : "h-2 w-2";

  const strip = (
    <div
      className="relative px-1 py-1"
      role="progressbar"
      aria-valuenow={unknown ? undefined : cur + 1}
      aria-valuemin={1}
      aria-valuemax={PIPELINE_PHASES.length}
      aria-label={`Fase do pedido: ${orderStatusLabel(status)}`}
    >
      <div
        className={`pointer-events-none absolute left-[6%] right-[6%] top-1/2 h-px -translate-y-1/2 bg-zinc-800/95 ${compact ? "opacity-90" : ""}`}
        aria-hidden
      />
      <div className="relative flex justify-between gap-0.5">
        {PIPELINE_PHASES.map((code, idx) => {
          const done = !unknown && idx < cur;
          const active = !unknown && idx === cur;
          return (
            <div
              key={code}
              className="flex min-w-0 flex-1 flex-col items-center"
              title={orderStatusLabel(code)}
            >
              <span
                className={`relative z-[1] shrink-0 rounded-full transition-all ${dotSm} ${
                  done
                    ? "bg-amber-400/95 shadow-[0_0_6px_rgba(251,191,36,0.35)]"
                    : active
                      ? `bg-amber-300 shadow-[0_0_0_2px_rgba(24,24,27,1),0_0_0_4px_rgba(251,191,36,0.45)] ${compact ? "" : "scale-110"}`
                      : "bg-zinc-700/95"
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  if (compact) {
    return strip;
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-black/35 to-black/20 px-4 py-3 ring-1 ring-white/[0.03]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
        Fluxo do pedido
      </p>
      {strip}
      <p className="mt-3 text-center text-[11px] text-zinc-500">
        Etapa{" "}
        <span className="font-semibold tabular-nums text-zinc-300">
          {unknown ? "—" : cur + 1}
        </span>{" "}
        de {PIPELINE_PHASES.length}
        <span className="text-zinc-600"> · </span>
        <span className="font-medium text-amber-200/90">
          {orderStatusLabel(status)}
        </span>
      </p>
    </div>
  );
}
