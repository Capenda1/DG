"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails de templates (URLs públicas / keys) */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApiRequestError,
  DESIGN_TEMPLATE_CATEGORY_LABELS,
  designTemplatePreviewUrl,
  type DesignTemplateCategory,
  type DesignTemplateListItem,
  listDesignTemplates,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { ROUTES } from "@/lib/routes";
import { APPAREL_PRODUCT_TYPES } from "@/lib/apparel-catalog";
import {
  designTemplateGarmentMatchesOrder,
  labelForDesignTemplateGarment,
} from "@/lib/design-template-garment";

/* ─── Constantes ───────────────────────────────────────────── */
const CATEGORIES = [
  { value: "", label: "Todos" },
  ...Object.entries(DESIGN_TEMPLATE_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
] as const;

export type ApplyMode = "replace" | "add";

/** Aspect ratio da imagem (largura/altura); fallback 1. */
function probeImageAspectRatio(srcUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(
        img.naturalWidth /
          Math.max(img.naturalHeight, 1),
      );
    img.onerror = () => resolve(1);
    img.src = srcUrl;
  });
}

interface TemplatesModalProps {
  onClose: () => void;
  onApply: (layersJson: unknown, mode: ApplyMode) => void;
  currentGarmentType?: string | null;
}

/* ─── Pré-visualização ampliada ─────────────────────────────── */
function PreviewPanel({
  tpl,
  onClose,
  onApplyTemplate,
  applying,
}: {
  tpl: DesignTemplateListItem;
  onClose: () => void;
  onApplyTemplate: () => void;
  applying: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl">
        {/* Linha decorativa */}
        <div className="h-[2px] shrink-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

        {/* Fechar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
        </button>

        {/* Preview */}
        <div
          className="relative flex h-64 items-center justify-center"
          style={{
            backgroundImage: "conic-gradient(#1e293b 25%,#0f172a 0 50%,#1e293b 0 75%,#0f172a 0)",
            backgroundSize: "10px 10px",
          }}
        >
          {tpl.previewKey ? (
            <img src={designTemplatePreviewUrl(tpl.previewKey) ?? tpl.previewKey} alt={tpl.title} className="h-full w-full object-contain p-4" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-700">
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
              </svg>
              <span className="text-xs">Sem pré-visualização</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">{tpl.title}</h3>
              {tpl.description && (
                <p className="mt-1 text-xs text-zinc-400">{tpl.description}</p>
              )}
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {DESIGN_TEMPLATE_CATEGORY_LABELS[tpl.category]}
            </span>
          </div>

          <div className="mt-4">
            {!tpl.previewKey?.trim() ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-200/85">
                Este modelo não tem pré-visualização registada — adiciona uma imagem em Admin (&quot;Modelos Prontos&quot;) para a poder usar como arte única aqui.
              </p>
            ) : (
              <button
                type="button"
                onClick={onApplyTemplate}
                disabled={applying}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border border-amber-400/30 border-t-amber-400" />
                    A aplicar…
                  </span>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    Adicionar ao design
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal principal ───────────────────────────────────────── */
export function TemplatesModal({
  onClose,
  onApply,
  currentGarmentType,
}: TemplatesModalProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<DesignTemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [category, setCategory] = useState<DesignTemplateCategory | "">("");
  const [search, setSearch] = useState("");
  /** Filtro local opcional por tipo de peça (pref. desligado: muitos modelos não definem garmentType ou usam valores que não coincidem com o pedido). */
  const [filterGarment, setFilterGarment] = useState(false);
  const [previewing, setPreviewing] = useState<DesignTemplateListItem | null>(null);
  const [applying, setApplying] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const session = loadSession();
    if (!session?.user) { setSessionMissing(true); setLoading(false); return; }
    setSessionMissing(false); setLoading(true); setError(null);
    try {
      const data = await listDesignTemplates(
        category ? { category: category as DesignTemplateCategory } : undefined,
      );
      setTemplates(data);
    } catch (e) {
      const status = (e as ApiRequestError)?.status;
      if (status === 401) setSessionMissing(true);
      else setError(e instanceof Error ? e.message : "Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(); }, [load]);

  /* Foco automático na pesquisa */
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  /* Filtro local (pesquisa + opcional tipo de peça) */
  const visible = useMemo(() => {
    let list = templates;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
      );
    }
    if (filterGarment && currentGarmentType) {
      list = list.filter((t) =>
        designTemplateGarmentMatchesOrder(t.garmentType, currentGarmentType),
      );
    }
    return list;
  }, [templates, search, filterGarment, currentGarmentType]);

  async function handleApplyTemplate(tpl: DesignTemplateListItem) {
    const key = tpl.previewKey?.trim();
    if (!key) {
      setError(
        "Este modelo não tem imagem de pré-visualização — adiciona uma no Admin para poder usar isto aqui.",
      );
      return;
    }
    const srcUrl = designTemplatePreviewUrl(key) ?? key;
    if (!srcUrl) {
      setError("URL da pré-visualização inválida.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const aspect = await probeImageAspectRatio(srcUrl);
      const widthRel = 0.42;
      const layersJson = [
        {
          kind: "image" as const,
          src: srcUrl,
          x: 0.5,
          y: 0.42,
          scale: 1,
          rotationDeg: 0,
          widthRel,
          aspect,
          opacity: 1,
          flipX: false,
          name:
            tpl.title.trim().slice(0, 120) ||
            tpl.id.slice(0, 24),
        },
      ];
      onApply(layersJson, "add");
      setPreviewing(null);
    } catch (e) {
      const status = (e as ApiRequestError)?.status;
      if (status === 401) setSessionMissing(true);
      else setError(e instanceof Error ? e.message : "Erro ao aplicar template.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl"
          style={{ maxHeight: "90vh" }}
        >
          {/* Linha decorativa */}
          <div className="h-[2px] shrink-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

          {/* ── Cabeçalho com pesquisa integrada ── */}
          <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-5 py-3">
            {/* Título */}
            <div className="shrink-0">
              <h2 className="text-base font-bold text-white">Modelos Prontos</h2>
            </div>

            {/* Pesquisa — lado direito, junto ao fechar */}
            <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-2.5 py-1.5 focus-within:border-amber-400/40 focus-within:ring-1 focus-within:ring-amber-400/10">
              <svg className="h-3 w-3 shrink-0 text-zinc-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar…"
                className="w-32 bg-transparent text-xs text-white outline-none placeholder:text-zinc-600 sm:w-44"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-zinc-600 hover:text-zinc-400"
                >
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 1l10 10M11 1L1 11" />
                  </svg>
                </button>
              )}
            </div>

            {/* Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          {/* ── Filtros ── */}
          <div className="shrink-0 border-b border-zinc-800 px-5 py-2">
            {/* Filtros em linha */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {/* Categorias */}
              {CATEGORIES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value as DesignTemplateCategory | "")}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    category === value
                      ? "bg-amber-500 text-zinc-950"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}

            </div>

            {currentGarmentType && (
              <label className="mt-2 flex cursor-pointer items-center gap-2.5 border-t border-zinc-800/80 pt-2.5 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={filterGarment}
                  onChange={(e) => setFilterGarment(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 accent-amber-500"
                />
                <span>
                  Só modelos para{" "}
                  {APPAREL_PRODUCT_TYPES.find((p) => p.id === currentGarmentType)
                    ?.label ?? currentGarmentType}{" "}
                  <span className="text-zinc-600">({currentGarmentType})</span>
                </span>
              </label>
            )}
          </div>

          {/* ── Conteúdo ── */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">

            {/* Sessão expirada */}
            {sessionMissing && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20">
                  <svg className="h-7 w-7 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-amber-400">Sessão expirada</p>
                <p className="mt-1 text-xs text-zinc-500">Faz login novamente para continuar.</p>
                <button
                  type="button"
                  onClick={() => router.replace(ROUTES.login)}
                  className="mt-4 rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-400"
                >
                  Ir para login
                </button>
              </div>
            )}

            {/* Erro */}
            {!sessionMissing && error && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="8" cy="8" r="7" /><path d="M8 5v3M8 11h.01" strokeLinecap="round"/>
                </svg>
                <div className="flex-1 text-sm text-red-300">{error}</div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="shrink-0 rounded-lg bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30"
                >
                  Tentar de novo
                </button>
              </div>
            )}

            {/* Loading */}
            {!sessionMissing && loading && (
              <div className="flex items-center justify-center py-16">
                <span className="mr-2.5 h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
                <span className="text-sm text-zinc-500">A carregar modelos…</span>
              </div>
            )}

            {/* Sem resultados */}
            {!sessionMissing && !loading && !error && visible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/60">
                  <svg className="h-7 w-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-zinc-400">
                  {search
                    ? `Sem resultados para "${search}"`
                    : templates.length > 0 && filterGarment && currentGarmentType
                      ? "Nenhum modelo combina com o tipo de peça deste pedido."
                      : "Nenhum modelo disponível."}
                </p>
                {templates.length > 0 && visible.length === 0 && filterGarment && currentGarmentType && !search && (
                  <button
                    type="button"
                    onClick={() => setFilterGarment(false)}
                    className="mt-2 text-xs font-medium text-amber-400 hover:text-amber-300"
                  >
                    Mostrar todos os modelos (ignorar compatibilidade de peça)
                  </button>
                )}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mt-2 text-xs text-amber-500 hover:text-amber-400"
                  >
                    Limpar pesquisa
                  </button>
                )}
                {!search && templates.length === 0 && (
                  <p className="mt-1 text-xs text-zinc-600">
                    Os modelos activos aparecem aqui. Em Admin (<span className="font-mono text-amber-600">Modelos Prontos</span>), confirma que estão marcados como <span className="text-zinc-400">activos</span>.
                  </p>
                )}
              </div>
            )}

            {/* Contador de resultados */}
            {!loading && visible.length > 0 && (
              <p className="mb-3 text-[11px] text-zinc-600">
                {visible.length} modelo{visible.length !== 1 ? "s" : ""}
                {search ? ` para "${search}"` : ""}
              </p>
            )}

            {/* Grid de templates */}
            {!sessionMissing && !loading && visible.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visible.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setPreviewing(tpl)}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-800/30 text-left transition hover:border-amber-500/50 hover:bg-zinc-800/60 hover:shadow-lg hover:shadow-amber-500/5"
                  >
                    {/* Preview */}
                    <div
                      className="relative flex h-36 items-center justify-center overflow-hidden"
                      style={{
                        backgroundImage: "conic-gradient(#1e293b 25%,#0f172a 0 50%,#1e293b 0 75%,#0f172a 0)",
                        backgroundSize: "8px 8px",
                      }}
                    >
                      {tpl.previewKey ? (
                        <img
                          src={designTemplatePreviewUrl(tpl.previewKey) ?? tpl.previewKey}
                          alt={tpl.title}
                          className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-zinc-700">
                          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                          </svg>
                          <span className="text-[10px]">Sem preview</span>
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/40">
                        <span className="flex translate-y-2 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-zinc-950 opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="6" cy="6" r="5" /><path d="M4 6l1.5 1.5L8 4"/>
                          </svg>
                          Ver modelo
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex flex-1 flex-col justify-between p-3">
                      <p className="text-xs font-semibold leading-snug text-white">{tpl.title}</p>
                      {tpl.description && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-zinc-500">{tpl.description}</p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-[9px] font-medium text-zinc-400">
                          {DESIGN_TEMPLATE_CATEGORY_LABELS[tpl.category]}
                        </span>
                        {tpl.garmentType && (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                            currentGarmentType &&
                            designTemplateGarmentMatchesOrder(
                              tpl.garmentType,
                              currentGarmentType,
                            )
                              ? "bg-violet-500/20 text-violet-300"
                              : "bg-zinc-700/30 text-zinc-600"
                          }`}>
                            {labelForDesignTemplateGarment(tpl.garmentType) ?? tpl.garmentType}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Rodapé ── */}
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/80 px-5 py-3">
            <p className="text-center text-[10px] text-zinc-600">
              <span className="text-amber-500/70">Ver modelo</span> para ver a pré-visualização;{" "}
              <span className="text-zinc-500">Adicionar ao design</span> insere essa imagem como uma única camada de arte (o desenho completo do modelo guardado na base não é importado).
            </p>
          </div>
        </div>
      </div>

      {/* ── Preview ampliado ── */}
      {previewing && (
        <PreviewPanel
          tpl={previewing}
          onClose={() => setPreviewing(null)}
          onApplyTemplate={() => void handleApplyTemplate(previewing)}
          applying={applying}
        />
      )}
    </>
  );
}
