"use client";

type Props = {
  readOnly: boolean;
  onAddText: () => void;
  onOpenTemplates: () => void;
  onUploadClick: () => void;
};

/** Orientação quando ainda não há camadas na composição. */
export function ModelagemEmptyState({
  readOnly,
  onAddText,
  onOpenTemplates,
  onUploadClick,
}: Props) {
  if (readOnly) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center p-4">
        <div className="max-w-xs rounded-xl border border-white/[0.08] bg-zinc-950/75 px-4 py-3 text-center backdrop-blur-sm">
          <p className="text-sm font-medium text-zinc-200">Sem arte visível</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            A composição ainda não foi criada ou está só disponível para consulta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] flex items-end justify-center p-4 pb-8 sm:items-center">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-amber-500/25 bg-zinc-950/85 px-4 py-3 text-center shadow-lg backdrop-blur-sm ring-1 ring-amber-400/10">
        <p className="text-sm font-semibold text-white">Começa o teu design</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          Adiciona texto, carrega uma imagem ou escolhe um modelo pronto.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onAddText}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 transition hover:bg-amber-300"
          >
            + Texto
          </button>
          <button
            type="button"
            onClick={onUploadClick}
            className="rounded-lg border border-zinc-600/60 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-800/60"
          >
            Imagem
          </button>
          <button
            type="button"
            onClick={onOpenTemplates}
            className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/20"
          >
            Modelos
          </button>
        </div>
      </div>
    </div>
  );
}
