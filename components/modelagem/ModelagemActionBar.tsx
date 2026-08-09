"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type ModelagemSidePanelTab = "add" | "edit" | "layers";

export function ModelagemSidePanelTabs({
  tab,
  onTabChange,
  layerCount,
  hasSelection,
}: {
  tab: ModelagemSidePanelTab;
  onTabChange: (t: ModelagemSidePanelTab) => void;
  layerCount: number;
  hasSelection: boolean;
}) {
  const tabs: { id: ModelagemSidePanelTab; label: string; badge?: string }[] = [
    { id: "add", label: "Adicionar" },
    { id: "edit", label: "Editar", badge: hasSelection ? "●" : undefined },
    { id: "layers", label: "Camadas", badge: layerCount > 0 ? String(layerCount) : undefined },
  ];

  return (
    <div
      className="flex gap-1 rounded-lg border border-zinc-700/40 bg-zinc-900/50 p-1"
      role="tablist"
      aria-label="Secções do editor"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onTabChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition duration-300 sm:text-[11px] ${
            tab === t.id
              ? "conta-filter-pill--active bg-amber-400/15 text-amber-800 ring-1 ring-amber-400/30 dark:text-amber-100"
              : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
          }`}
        >
          {t.label}
          {t.badge ? (
            <span className="text-[9px] tabular-nums text-amber-300/90">{t.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ModelagemActionBar({
  saveDraftBusy,
  layersEmpty,
  clientModelagemReadOnly,
  showSubmit,
  showBalcaoContinue,
  isStaff,
  podeExportarSpecs,
  saveDraftOk,
  saveDraftErr,
  autoSaveLabel,
  onSaveDraft,
  onExportPng,
  onExportSpecsPdf,
  onExportSpecsCsv,
  onSaveTemplate,
  onSubmit,
  onContinueBalcao,
}: {
  saveDraftBusy: boolean;
  layersEmpty: boolean;
  clientModelagemReadOnly: boolean;
  showSubmit: boolean;
  showBalcaoContinue: boolean;
  isStaff: boolean;
  podeExportarSpecs: boolean;
  saveDraftOk: string | null;
  saveDraftErr: string | null;
  autoSaveLabel?: string | null;
  onSaveDraft: () => void;
  onExportPng: () => void;
  onExportSpecsPdf: () => void;
  onExportSpecsCsv: () => void;
  onSaveTemplate: () => void;
  onSubmit: () => void;
  onContinueBalcao: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  return (
    <div className="conta-animate-fade-up fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/90 bg-white/95 px-3 py-2.5 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/95 dark:shadow-none sm:static sm:mt-3 sm:rounded-xl sm:border sm:px-4 sm:py-3" style={{ "--conta-delay": "200ms" } as CSSProperties}>
      {(saveDraftOk || saveDraftErr || autoSaveLabel) && (
        <div className="mb-2 space-y-0.5">
          {autoSaveLabel ? (
            <p className="text-[10px] text-zinc-500" role="status">
              {autoSaveLabel}
            </p>
          ) : null}
          {saveDraftOk ? (
            <p className="flex items-center gap-1 text-[11px] text-amber-300" role="status">
              <span>✓</span>
              {saveDraftOk}
            </p>
          ) : null}
          {saveDraftErr ? (
            <p className="text-[11px] text-red-400" role="alert">
              {saveDraftErr}
            </p>
          ) : null}
        </div>
      )}

      <div className="mx-auto flex max-w-[1600px] items-stretch gap-2">
        {!clientModelagemReadOnly ? (
          <button
            type="button"
            disabled={saveDraftBusy || layersEmpty}
            onClick={onSaveDraft}
            className="hidden shrink-0 rounded-xl border border-zinc-600/50 bg-zinc-800/40 px-4 py-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex sm:items-center"
          >
            {saveDraftBusy ? "A guardar…" : "Guardar"}
          </button>
        ) : null}

        {showBalcaoContinue ? (
          <button
            type="button"
            disabled={saveDraftBusy}
            onClick={onContinueBalcao}
            className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-55"
          >
            {saveDraftBusy ? "A guardar…" : "Continuar no balcão"}
          </button>
        ) : showSubmit ? (
          <button
            type="button"
            disabled={saveDraftBusy || layersEmpty}
            onClick={onSubmit}
            className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {saveDraftBusy ? "A guardar…" : "Submeter pedido"}
          </button>
        ) : null}

        {!clientModelagemReadOnly ? (
          <button
            type="button"
            disabled={saveDraftBusy || layersEmpty}
            onClick={onSaveDraft}
            className="flex flex-1 items-center justify-center rounded-xl border border-zinc-600/50 bg-zinc-800/40 py-2.5 text-xs font-semibold text-zinc-200 sm:hidden"
          >
            Guardar
          </button>
        ) : null}

        <div className="relative shrink-0" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="flex h-full items-center rounded-xl border border-zinc-700/45 bg-zinc-900/50 px-3 py-2.5 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200"
          >
            Mais
          </button>
          {moreOpen ? (
            <div className="absolute bottom-full right-0 z-10 mb-1 min-w-[11rem] overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-900 py-1 shadow-xl">
              <button
                type="button"
                disabled={layersEmpty}
                onClick={() => {
                  onExportPng();
                  setMoreOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Exportar PNG
              </button>
              <button
                type="button"
                disabled={!podeExportarSpecs}
                onClick={() => {
                  onExportSpecsPdf();
                  setMoreOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Especificações PDF
              </button>
              <button
                type="button"
                disabled={!podeExportarSpecs}
                onClick={() => {
                  onExportSpecsCsv();
                  setMoreOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Especificações Excel
              </button>
              {isStaff ? (
                <button
                  type="button"
                  disabled={layersEmpty}
                  onClick={() => {
                    onSaveTemplate();
                    setMoreOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-[11px] text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Guardar como template
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
