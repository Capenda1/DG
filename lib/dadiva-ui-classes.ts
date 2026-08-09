/**
 * Tema visual Dádiva Go (âmbar / violeta / sky) — carteiras de classes Tailwind
 * reutilizáveis no back-office e ecrãs de autenticação.
 */

/** Cartão principal com faixa superior em gradiente. */
export const dadivaSurfaceCard =
  "relative overflow-hidden rounded-2xl border border-zinc-200/85 bg-gradient-to-br from-white via-white to-amber-50/[0.45] p-5 shadow-[0_16px_50px_-28px_rgba(245,158,11,0.22),0_2px_8px_-4px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-[1] before:h-[3px] before:bg-gradient-to-r before:from-amber-500 before:via-violet-500 before:to-sky-500 before:opacity-95 before:content-[''] dark:border-zinc-600/85 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/35 dark:shadow-black/35 dark:ring-white/[0.04] sm:p-6";

export const dadivaLabel =
  "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400";

export const dadivaLabelCompact =
  "mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400";

/** Campo texto padrão (formulários admin / PDV). */
export const dadivaInput =
  "w-full rounded-xl border border-zinc-300/90 bg-white/95 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-zinc-400 focus:border-amber-500/55 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.18)] dark:border-zinc-600 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-400/50 dark:focus:shadow-[0_0_0_3px_rgba(251,191,36,0.12)]";

export const dadivaInputReadonly =
  "cursor-default border-zinc-200/90 bg-gradient-to-br from-zinc-100 to-zinc-50 text-zinc-700 opacity-[0.98] dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-300";

export const dadivaFileInputBase =
  "block w-full cursor-pointer text-xs leading-relaxed text-zinc-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border file:border-amber-300/60 file:bg-gradient-to-b file:from-amber-50 file:to-white file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-amber-950 file:shadow-sm file:ring-1 file:ring-amber-400/30 file:transition-all hover:file:border-amber-400 hover:file:from-amber-100 hover:file:shadow-md dark:text-zinc-400 dark:file:border-amber-500/40 dark:file:from-amber-950/50 dark:file:to-zinc-900 dark:file:text-amber-200 dark:file:ring-amber-400/20 dark:hover:file:from-amber-900/60";

/** Login / formulários com mais peso visual. */
export const dadivaLabelAuth =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 dark:text-white/80";

export const dadivaInputAuth =
  "w-full rounded-xl border-2 border-zinc-300 bg-white py-3 text-[15px] text-zinc-900 shadow-[inset_0_1px_0_rgba(0,0,0,0.04)] outline-none transition placeholder:text-zinc-400 focus:border-amber-500/80 focus:ring-2 focus:ring-amber-400/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:placeholder:text-zinc-600 dark:focus:border-amber-400/70 dark:focus:ring-amber-300/20";

export const dadivaBtnPrimaryAuth =
  "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3.5 text-sm font-bold text-black shadow-lg shadow-amber-500/30 transition hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-400/40 disabled:pointer-events-none disabled:opacity-50";

/** Botão gradiente forte (links / CTAs). */
export const dadivaBtnAccentSolid =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_24px_-8px_rgba(245,158,11,0.75)] ring-2 ring-black/25 transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:from-amber-300 hover:to-amber-400 hover:shadow-[0_14px_28px_-8px_rgba(245,158,11,0.85)] hover:ring-black/35 active:translate-y-0 dark:from-amber-400 dark:to-amber-500 dark:text-black dark:ring-white/35 dark:hover:-translate-y-px dark:hover:to-amber-400 sm:py-3";

/** Estado de espera / redireccionamento ( página inicial ). */
export const dadivaScreenWaiting =
  "flex min-h-svh items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-amber-50/35 text-sm text-zinc-600 dark:from-[#0a0a0a] dark:via-zinc-950 dark:to-violet-950/25 dark:text-zinc-500";
