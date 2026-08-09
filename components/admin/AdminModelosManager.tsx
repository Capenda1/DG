"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas de modelos e uploads (URLs da API) */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createDesignTemplate,
  deleteDesignTemplate,
  designTemplatePreviewUrl,
  DESIGN_TEMPLATE_CATEGORY_LABELS,
  type DesignTemplateCategory,
  type DesignTemplateListItem,
  getDesignTemplate,
  listDesignTemplates,
  updateDesignTemplate,
  uploadDesignTemplatePreview,
} from "@/lib/api-client";
import { APPAREL_PRODUCT_TYPES } from "@/lib/apparel-catalog";
import { labelForDesignTemplateGarment } from "@/lib/design-template-garment";
import { sanitizeUnsignedIntString } from "@/lib/numeric-input";

const CATEGORIES = Object.entries(DESIGN_TEMPLATE_CATEGORY_LABELS) as [
  DesignTemplateCategory,

  string,
][];

type FilterTab = "all" | "active" | "inactive";

type ToastState = { message: string; tone: "success" | "error" };

/* ── Formulário de criação/edição ── */

type FormState = {
  title: string;

  description: string;

  category: DesignTemplateCategory;

  garmentType: string;

  layersJson: string;

  active: boolean;

  sortOrder: string;

  previewDataUrl: string;
};

const EMPTY_FORM: FormState = {
  title: "",

  description: "",

  category: "OUTROS",

  garmentType: "",

  layersJson: "[]",

  active: true,

  sortOrder: "0",

  previewDataUrl: "",
};

function parseLayersJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function ModalSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </h3>
  );
}

function TemplateCardSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40"
          aria-hidden
        >
          <div className="h-36 animate-pulse bg-zinc-800/80 motion-reduce:animate-none" />

          <div className="space-y-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-700/70 motion-reduce:animate-none" />

            <div className="h-3 w-full animate-pulse rounded bg-zinc-800/70 motion-reduce:animate-none" />

            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-800/70 motion-reduce:animate-none" />
          </div>

          <div className="flex border-t border-zinc-800/80 px-3 py-2">
            <div className="h-6 w-14 animate-pulse rounded-full bg-zinc-800/70 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </>
  );
}

export function AdminModelosManager() {
  const baseId = useId();

  const [templates, setTemplates] = useState<DesignTemplateListItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterTab>("all");

  const [toast, setToast] = useState<ToastState | null>(null);

  /* Modal */

  const [modalOpen, setModalOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  /* Confirmação de eliminação */

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  /* Preview — após upload multipart grava-se o caminho `/api/…` em DB (legacy: data URL) */

  const previewInputRef = useRef<HTMLInputElement>(null);

  const [previewUploading, setPreviewUploading] = useState(false);

  useEffect(() => {
    if (!toast) return;

    const t = window.setTimeout(() => setToast(null), 3600);

    return () => window.clearTimeout(t);
  }, [toast]);

  const pushToast = useCallback((message: string, tone: ToastState["tone"]) => {
    setToast({ message, tone });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    setError(null);

    try {
      const data = await listDesignTemplates({ all: true });

      setTemplates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let active = 0;

    for (const t of templates) {
      if (t.active) active += 1;
    }

    return {
      total: templates.length,

      active,

      inactive: templates.length - active,
    };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (filter === "all") return templates;

    if (filter === "active") return templates.filter((t) => t.active);

    return templates.filter((t) => !t.active);
  }, [templates, filter]);

  const refreshingGrid = loading && templates.length > 0;

  const showInitialSpinner = loading && templates.length === 0;

  function openCreate() {
    setEditingId(null);

    setForm(EMPTY_FORM);

    setFormError(null);

    setModalOpen(true);
  }

  async function openEdit(tpl: DesignTemplateListItem) {
    setEditingId(tpl.id);

    setFormError(null);

    setForm({
      title: tpl.title,

      description: tpl.description ?? "",

      category: tpl.category,

      garmentType: tpl.garmentType ?? "",

      layersJson: "[]",

      active: tpl.active,

      sortOrder: String(tpl.sortOrder),

      previewDataUrl: tpl.previewKey ?? "",
    });

    setModalOpen(true);

    /* Carrega o layersJson completo (não vem no listAll) */

    try {
      const full = await getDesignTemplate(tpl.id);

      setForm((f) => ({
        ...f,

        layersJson: JSON.stringify(full.layersJson, null, 2),
      }));
    } catch {
      /* mantém "[]" se falhar */
    }
  }

  async function handlePreviewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    setPreviewUploading(true);

    setFormError(null);

    try {
      const { previewKey } = await uploadDesignTemplatePreview(file);

      setForm((f) => ({ ...f, previewDataUrl: previewKey }));
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Upload da imagem falhou.",
      );
    } finally {
      setPreviewUploading(false);

      e.target.value = "";
    }
  }

  async function handleSave() {
    setFormError(null);

    if (!form.title.trim()) {
      setFormError("O título é obrigatório.");

      return;
    }

    const layers = parseLayersJson(form.layersJson);

    if (!Array.isArray(layers)) {
      setFormError("O JSON das camadas deve ser um array.");

      return;
    }

    setSaving(true);

    try {
      const payload = {
        title: form.title.trim(),

        description: form.description.trim() || undefined,

        category: form.category,

        garmentType: form.garmentType.trim() || undefined,

        previewKey: form.previewDataUrl || undefined,

        layersJson: layers,

        active: form.active,

        sortOrder: parseInt(form.sortOrder, 10) || 0,
      };

      if (editingId) {
        await updateDesignTemplate(editingId, payload);

        pushToast("Template actualizado.", "success");
      } else {
        await createDesignTemplate(payload);

        pushToast("Template criado.", "success");
      }

      setModalOpen(false);

      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);

    try {
      await deleteDesignTemplate(id);

      setConfirmDeleteId(null);

      pushToast("Template eliminado.", "success");

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(tpl: DesignTemplateListItem) {
    try {
      await updateDesignTemplate(tpl.id, { active: !tpl.active });

      pushToast(
        tpl.active ? "Marcado como inactivo." : "Marcado como activo.",
        "success",
      );

      await load();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível alterar o estado activo/inactivo.";

      setError(msg);
    }
  }

  const filterTabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: "all", label: "Todos", count: stats.total },

    { id: "active", label: "Activos", count: stats.active },

    { id: "inactive", label: "Inactivos", count: stats.inactive },
  ];

  const skeletonCount = Math.min(8, Math.max(templates.length, 4));

  return (
    <div className="p-6 lg:p-8">
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[60] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-xl ${
            toast.tone === "success"
              ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
              : "border-red-500/30 bg-red-950/90 text-red-100"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Cabeçalho */}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Modelos Prontos
          </h1>

          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Templates de design carregados por Admin ou Designer — disponíveis
            no editor de modelagem.
          </p>

          {!showInitialSpinner && (
            <p className="mt-2 text-xs text-zinc-400">
              <span className="tabular-nums font-medium text-zinc-300">
                {stats.total}
              </span>{" "}
              templates —{" "}
              <span className="tabular-nums text-amber-400/90">
                {stats.active}
              </span>{" "}
              activos,{" "}
              <span className="tabular-nums text-zinc-400">
                {stats.inactive}
              </span>{" "}
              inactivos
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 motion-safe:active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M8 2v12M2 8h12" />
          </svg>
          Novo Template
        </button>
      </div>

      {/* Erros */}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Filtros */}

      {!showInitialSpinner && stats.total > 0 && (
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filtrar templates"
        >
          {filterTabs.map((tab) => {
            const selected = filter === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                    : "border-zinc-700/80 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                {tab.label}

                {tab.count !== undefined && (
                  <span
                    className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] ${
                      selected
                        ? "bg-amber-500/25 text-amber-100"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading inicial */}

      {showInitialSpinner && (
        <div className="flex items-center justify-center py-20 text-sm text-zinc-400">
          <span
            className="mr-2 h-4 w-4 motion-safe:animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400 motion-reduce:animate-none"
            aria-hidden
          />
          A carregar…
        </div>
      )}

      {/* Skeleton ao actualizar */}

      {refreshingGrid && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <TemplateCardSkeleton count={skeletonCount} />
        </div>
      )}

      {/* Grid de templates */}

      {!loading && filteredTemplates.length === 0 && stats.total > 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Nenhum template neste filtro.
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            Altera os filtros em cima ou cria um novo modelo.
          </p>

          <button
            type="button"
            className="mt-4 text-sm font-medium text-amber-400/90 underline underline-offset-2 hover:text-amber-300"
            onClick={() => setFilter("all")}
          >
            Ver todos
          </button>
        </div>
      )}

      {!loading && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-20 text-center">
          <svg
            className="mb-3 h-10 w-10 text-zinc-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />

            <path d="M3 9h18M9 21V9" />
          </svg>

          <p className="text-sm font-medium text-zinc-400">
            Nenhum template criado ainda.
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            Cria o primeiro template com o botão acima.
          </p>
        </div>
      )}

      {!loading && filteredTemplates.length > 0 && !refreshingGrid && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              confirmDeleteId={confirmDeleteId}
              deleting={deleting}
              onEdit={openEdit}
              onToggleActive={toggleActive}
              onConfirmDelete={setConfirmDeleteId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal criar/editar */}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-modal-title`}
        >
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl">
            {/* Cabeçalho do modal */}

            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h2
                id={`${baseId}-modal-title`}
                className="text-base font-semibold text-white"
              >
                {editingId ? "Editar Template" : "Novo Template"}
              </h2>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 outline-none ring-amber-500/40 transition hover:bg-zinc-800 hover:text-white focus-visible:ring-2"
                aria-label="Fechar"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M2 2l12 12M14 2L2 14" />
                </svg>
              </button>
            </div>

            {/* Corpo */}

            <div className="max-h-[75vh] overflow-y-auto p-5 md:p-6">
              <div className="flex flex-col gap-8 md:flex-row md:gap-8">
                {/* Coluna preview */}

                <div className="shrink-0 md:w-[220px]">
                  <ModalSectionTitle>Preview</ModalSectionTitle>

                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950/80">
                      {form.previewDataUrl ? (
                        <img
                          src={
                            designTemplatePreviewUrl(form.previewDataUrl) ??
                            form.previewDataUrl
                          }
                          alt=""
                          className="h-full w-full object-contain p-2"
                        />
                      ) : (
                        <svg
                          className="h-14 w-14 text-zinc-700"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />

                          <path d="M3 9h18M9 21V9" />
                        </svg>
                      )}
                    </div>

                    <input
                      ref={previewInputRef}
                      id={`${baseId}-preview-file`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handlePreviewFile}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => previewInputRef.current?.click()}
                        disabled={previewUploading}
                        className="flex-1 rounded-lg border border-zinc-600/50 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 outline-none ring-amber-500/30 transition hover:border-amber-500/40 hover:text-amber-200 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {previewUploading
                          ? "A enviar…"
                          : form.previewDataUrl
                            ? "Alterar"
                            : "Imagem"}
                      </button>

                      {form.previewDataUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, previewDataUrl: "" }))
                          }
                          className="rounded-lg px-2 py-2 text-xs text-red-400/90 underline decoration-red-400/40 outline-none transition hover:text-red-300 hover:decoration-red-300 focus-visible:ring-2 focus-visible:ring-red-400/40"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Campos */}

                <div className="min-w-0 flex-1 space-y-6">
                  <section
                    className="space-y-3"
                    aria-labelledby={`${baseId}-sec-id`}
                  >
                    <ModalSectionTitle>
                      <span id={`${baseId}-sec-id`}>Identificação</span>
                    </ModalSectionTitle>

                    <div>
                      <label
                        htmlFor={`${baseId}-title`}
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Título *
                      </label>

                      <input
                        id={`${baseId}-title`}
                        type="text"
                        value={form.title}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, title: e.target.value }))
                        }
                        placeholder="Ex: Camisola Desportiva Azul"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none ring-amber-500/30 focus:border-amber-500/60 focus:ring-2"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`${baseId}-description`}
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Descrição
                      </label>

                      <textarea
                        id={`${baseId}-description`}
                        value={form.description}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Descreve o estilo ou contexto do template…"
                        rows={3}
                        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none ring-amber-500/30 focus:border-amber-500/60 focus:ring-2"
                      />
                    </div>
                  </section>

                  <section
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                    aria-labelledby={`${baseId}-sec-class`}
                  >
                    <div className="sm:col-span-2">
                      <ModalSectionTitle>
                        <span id={`${baseId}-sec-class`}>Classificação</span>
                      </ModalSectionTitle>
                    </div>

                    <div>
                      <label
                        htmlFor={`${baseId}-category`}
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Categoria
                      </label>

                      <select
                        id={`${baseId}-category`}
                        value={form.category}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,

                            category: e.target.value as DesignTemplateCategory,
                          }))
                        }
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none ring-amber-500/30 focus:border-amber-500/60 focus:ring-2"
                      >
                        {CATEGORIES.map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`${baseId}-garment`}
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Tipo de peça
                      </label>

                      <select
                        id={`${baseId}-garment`}
                        value={form.garmentType}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            garmentType: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none ring-amber-500/30 focus:border-amber-500/60 focus:ring-2"
                      >
                        <option value="">Qualquer (todos os pedidos)</option>
                        {APPAREL_PRODUCT_TYPES.map(({ id, label }) => (
                          <option key={id} value={id}>
                            {label} ({id})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Usa os mesmos códigos que o novo pedido (T-shirt, Polo, Colete, Boné) para filtragem em modelagem coincidir.
                      </p>
                    </div>
                  </section>

                  <section
                    className="space-y-4"
                    aria-labelledby={`${baseId}-sec-pub`}
                  >
                    <ModalSectionTitle>
                      <span id={`${baseId}-sec-pub`}>Publicação</span>
                    </ModalSectionTitle>

                    <div className="flex flex-wrap items-end gap-6">
                      <div className="min-w-[6rem] flex-1">
                        <label
                          htmlFor={`${baseId}-sort`}
                          className="mb-1 block text-xs font-medium text-zinc-400"
                        >
                          Ordem na lista
                        </label>

                        <input
                          id={`${baseId}-sort`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={form.sortOrder}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              sortOrder: sanitizeUnsignedIntString(
                                e.target.value,
                              ),
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none ring-amber-500/30 focus:border-amber-500/60 focus:ring-2"
                        />
                      </div>

                      <label className="flex cursor-pointer items-center gap-2.5 pb-1">
                        <input
                          id={`${baseId}-active`}
                          type="checkbox"
                          checked={form.active}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, active: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-amber-500 outline-none ring-amber-500/40 focus-visible:ring-2"
                        />

                        <span className="text-sm text-zinc-300">
                          Visível como activo
                        </span>
                      </label>
                    </div>
                  </section>

                  {/* Aviso — camadas */}

                  <div className="flex items-start gap-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-3 py-2.5">
                    <svg
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400"
                      fill="none"
                      viewBox="0 0 16 16"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <circle cx="8" cy="8" r="7" />

                      <path d="M8 5v3M8 11h.01" />
                    </svg>

                    <p className="text-[11px] leading-relaxed text-violet-200/85">
                      As camadas de design são criadas no editor de modelagem —
                      usa{" "}
                      <span className="font-semibold text-violet-200">
                        Guardar como Template
                      </span>{" "}
                      (Admin/Designer).
                    </p>
                  </div>
                </div>
              </div>

              {formError && (
                <p
                  className="mt-5 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-300"
                  role="alert"
                >
                  {formError}
                </p>
              )}
            </div>

            {/* Rodapé */}

            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 outline-none ring-amber-500/30 transition hover:text-white focus-visible:ring-2"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 outline-none ring-amber-500/40 transition hover:bg-amber-400 motion-safe:disabled:opacity-60 focus-visible:ring-2 motion-reduce:disabled:opacity-60"
              >
                {saving && (
                  <span
                    className="h-3.5 w-3.5 motion-safe:animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-950 motion-reduce:animate-none"
                    aria-hidden
                  />
                )}

                {editingId ? "Guardar alterações" : "Criar template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card individual ── */

function TemplateCard({
  tpl,

  confirmDeleteId,

  deleting,

  onEdit,

  onToggleActive,

  onConfirmDelete,

  onDelete,
}: {
  tpl: DesignTemplateListItem;

  confirmDeleteId: string | null;

  deleting: boolean;

  onEdit: (t: DesignTemplateListItem) => void;

  onToggleActive: (t: DesignTemplateListItem) => void;

  onConfirmDelete: (id: string | null) => void;

  onDelete: (id: string) => void;
}) {
  const confirming = confirmDeleteId === tpl.id;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-zinc-900/60 transition motion-safe:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
        tpl.active
          ? "border-zinc-700/60 shadow-sm hover:border-amber-500/45 hover:shadow-lg hover:shadow-amber-500/5"
          : "border-zinc-700/35 bg-zinc-950/35"
      }`}
    >
      {/* Preview — clique para editar */}

      <button
        type="button"
        className="relative flex h-36 w-full cursor-pointer items-center justify-center bg-zinc-950/70 text-left outline-none ring-inset ring-amber-500/0 transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-amber-400/70"
        style={{
          backgroundImage:
            "conic-gradient(#1e293b 25%,#0f172a 0 50%,#1e293b 0 75%,#0f172a 0)",

          backgroundSize: "10px 10px",
        }}
        onClick={() => onEdit(tpl)}
        aria-label={`Editar template: ${tpl.title}`}
      >
        {tpl.previewKey ? (
          <img
            src={designTemplatePreviewUrl(tpl.previewKey) ?? tpl.previewKey}
            alt=""
            className="pointer-events-none h-full w-full object-contain p-2"
          />
        ) : (
          <svg
            className="pointer-events-none h-10 w-10 text-zinc-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />

            <path d="M3 9h18M9 21V9" />
          </svg>
        )}

        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-zinc-800/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-300">
          {DESIGN_TEMPLATE_CATEGORY_LABELS[tpl.category]}
        </span>

        {!tpl.active && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-zinc-600/60 bg-zinc-900/92 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Inactivo
          </span>
        )}
      </button>

      {/* Info — altura mínima alinhada */}

      <div
        className={`flex flex-1 flex-col p-3 ${!tpl.active ? "bg-black/25" : ""}`}
      >
        <button
          type="button"
          className="-m-1 rounded-lg p-1 text-left outline-none ring-amber-500/30 hover:bg-white/5 focus-visible:ring-2"
          onClick={() => onEdit(tpl)}
        >
          <p className="text-sm font-semibold leading-snug text-white">
            {tpl.title}
          </p>
        </button>

        <div className="mt-1 min-h-[2.625rem]">
          {tpl.description ? (
            <p className="line-clamp-2 text-xs text-zinc-400">
              {tpl.description}
            </p>
          ) : (
            <p className="text-xs text-zinc-600">Sem descrição</p>
          )}
        </div>

        {labelForDesignTemplateGarment(tpl.garmentType) ? (
          <p className="mt-2 text-[10px] text-zinc-500">
            {labelForDesignTemplateGarment(tpl.garmentType)}
          </p>
        ) : null}
      </div>

      {/* Acções */}

      {confirming ? (
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2">
          <p className="text-xs text-red-400">Eliminar definitivamente?</p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(tpl.id)}
              aria-label="Confirmar eliminação"
              className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-400 disabled:opacity-60"
            >
              {deleting ? "…" : "Sim"}
            </button>

            <button
              type="button"
              onClick={() => onConfirmDelete(null)}
              className="rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-zinc-600"
            >
              Não
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2">
          <button
            type="button"
            onClick={() => onToggleActive(tpl)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
              tpl.active
                ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                : "bg-zinc-700/55 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {tpl.active ? "Activo" : "Inactivo"}
          </button>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onEdit(tpl)}
              className="rounded-lg p-1.5 text-zinc-500 outline-none ring-amber-500/30 transition hover:bg-zinc-800 hover:text-white focus-visible:ring-2"
              aria-label="Editar"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M11.5 2.5a2.12 2.12 0 0 1 3 3L5 15H2v-3L11.5 2.5z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => onConfirmDelete(tpl.id)}
              className="rounded-lg p-1.5 text-zinc-500 outline-none ring-red-400/35 transition hover:bg-red-950/60 hover:text-red-400 focus-visible:ring-2"
              aria-label="Eliminar"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
