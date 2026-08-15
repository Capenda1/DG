import Link from "next/link";

export const ORDER_WIZARD_STEPS = [
  { n: 1, label: "Artigos", title: "Escolher os artigos" },
  { n: 2, label: "Design", title: "Design" },
  { n: 3, label: "Submissão", title: "Submissão" },
] as const;

export type OrderWizardStep = 1 | 2 | 3;

/** Passos Artigos → Design → Submissão (fluxo novo pedido online). */
export function OrderCreationWizard({
  activeStep,
  step1Href,
  className = "",
}: {
  activeStep: OrderWizardStep;
  /** Se definido, o passo 1 («Escolher os artigos») é clicável a partir dos passos 2 e 3. */
  step1Href?: string;
  className?: string;
}) {
  return (
    <ol
      className={`flex items-center gap-0.5 sm:gap-1 ${className}`}
      aria-label="Passos do pedido"
    >
      {ORDER_WIZARD_STEPS.map((step, i) => {
        const active = step.n === activeStep;
        const done = step.n < activeStep;
        const inner = (
          <>
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold sm:h-5 sm:w-5 sm:text-[10px] ${
                active
                  ? "bg-amber-400 text-zinc-950"
                  : done
                    ? "bg-emerald-500/20 text-emerald-800 ring-1 ring-emerald-500/35 dark:text-emerald-200"
                    : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
              }`}
            >
              {done ? "✓" : step.n}
            </span>
            <span
              className={`hidden truncate text-[10px] font-medium sm:inline ${
                active
                  ? "text-amber-800 dark:text-amber-100"
                  : done
                    ? "text-emerald-800/90 dark:text-emerald-200/80"
                    : "text-zinc-500"
              }`}
            >
              {step.label}
            </span>
          </>
        );
        const boxClass = `flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 sm:gap-1.5 sm:rounded-lg sm:px-2 sm:py-1 ${
          active
            ? "bg-amber-400/10 ring-1 ring-amber-400/25"
            : done
              ? "bg-emerald-500/5 ring-1 ring-emerald-500/15"
              : "opacity-45"
        }`;
        const canGoToArtigos = step.n === 1 && Boolean(step1Href) && !active;
        return (
          <li key={step.n} className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
            {canGoToArtigos ? (
              <Link
                href={step1Href!}
                className={`${boxClass} cursor-pointer transition hover:ring-amber-400/40`}
                title={step.title}
                aria-label={step.title}
              >
                {inner}
              </Link>
            ) : (
              <div className={boxClass} aria-current={active ? "step" : undefined}>
                {inner}
              </div>
            )}
            {i < ORDER_WIZARD_STEPS.length - 1 ? (
              <span className="shrink-0 text-[9px] text-zinc-400 dark:text-zinc-700 sm:text-[10px]" aria-hidden>
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
