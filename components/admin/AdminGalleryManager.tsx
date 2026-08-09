"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  clientGalleryImageUrl,
  createClientGalleryItem,
  deleteClientGalleryItem,
  listClientGalleryItems,
  updateClientGalleryItem,
  uploadClientGalleryImage,
  type ClientGalleryItem,
} from "@/lib/api-client";
import { sanitizeUnsignedIntString } from "@/lib/numeric-input";
import {
  CLIENT_GALLERY_SPEC,
  evaluateGalleryImageFit,
  formatGalleryRatio,
  readImageDimensions,
  type GalleryFitEvaluation,
} from "@/lib/client-gallery-spec";

type FormState = {
  title: string;
  description: string;
  sortOrder: string;
  active: boolean;
  imageKey: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  sortOrder: "0",
  active: true,
  imageKey: "",
};

const FIT_BADGE: Record<
  GalleryFitEvaluation["level"],
  { className: string }
> = {
  ideal: {
    className: "border-emerald-500/30 bg-emerald-950/40 text-emerald-300",
  },
  good: {
    className: "border-amber-500/25 bg-amber-950/35 text-amber-200",
  },
  portrait: {
    className: "border-violet-500/25 bg-violet-950/35 text-violet-200",
  },
  wide: {
    className: "border-orange-500/25 bg-orange-950/35 text-orange-200",
  },
};

function GallerySpecPanel({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-950/25 via-zinc-900/40 to-zinc-950/60 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
        Proporções recomendadas
      </p>
      <ul className={`mt-2 space-y-1.5 text-[11px] leading-snug text-zinc-400 ${compact ? "" : "sm:columns-2 sm:gap-6"}`}>
        <li>
          <span className="font-semibold text-zinc-200">Ideal:</span>{" "}
          {CLIENT_GALLERY_SPEC.idealLabel} · {CLIENT_GALLERY_SPEC.idealSize}
        </li>
        <li>
          <span className="font-semibold text-zinc-200">Alternativas:</span>{" "}
          {CLIENT_GALLERY_SPEC.altLabels.join(" ou ")}
        </li>
        <li>
          <span className="font-semibold text-zinc-200">Largura mín.</span>{" "}
          {CLIENT_GALLERY_SPEC.minWidth} px · {CLIENT_GALLERY_SPEC.formats} · máx.{" "}
          {CLIENT_GALLERY_SPEC.maxFileMb} MB
        </li>
        {!compact ? (
          <li className="sm:col-span-2">
            O slideshow mostra a imagem completa (sem cortes). Horizontal 16:9 ocupa melhor o
            palco; verticais ficam com margens laterais.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function GalleryPreviewFrame({
  imageUrl,
  fit,
  dimensions,
}: {
  imageUrl: string;
  fit: GalleryFitEvaluation | null;
  dimensions: { width: number; height: number } | null;
}) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Pré-visualização · palco cliente (16:9)
      </p>
      <div className="relative overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 ring-1 ring-white/5">
        <div className="relative aspect-[16/9] w-full">
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            className="absolute inset-[-10%] h-[120%] w-[120%] object-cover blur-2xl brightness-[0.45] saturate-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/25 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center p-4 pb-8">
            <img
              src={imageUrl}
              alt=""
              className="max-h-full max-w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
            />
          </div>
          <div className="pointer-events-none absolute inset-3 rounded-lg border border-dashed border-white/15" />
        </div>
      </div>
      {fit && dimensions ? (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${FIT_BADGE[fit.level].className}`}
        >
          <span className="font-bold">{fit.label}</span>
          <span className="text-zinc-500">·</span>
          <span className="tabular-nums opacity-90">
            {dimensions.width} × {dimensions.height} px ({formatGalleryRatio(fit.ratio)})
          </span>
          <span className="w-full text-[10px] leading-snug opacity-90">{fit.detail}</span>
        </div>
      ) : null}
    </div>
  );
}

export function AdminGalleryManager() {
  const baseId = useId();
  const [items, setItems] = useState<ClientGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [imageFit, setImageFit] = useState<GalleryFitEvaluation | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const pushToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listClientGalleryItems({ all: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar galeria.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyImageMeta = useCallback(async (fileOrUrl: File | string) => {
    try {
      const dims = await readImageDimensions(fileOrUrl);
      setImageDimensions(dims);
      setImageFit(evaluateGalleryImageFit(dims.width, dims.height));
    } catch {
      setImageDimensions(null);
      setImageFit(null);
    }
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImageDimensions(null);
    setImageFit(null);
    setModalOpen(true);
  };

  const openEdit = (item: ClientGalleryItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description ?? "",
      sortOrder: String(item.sortOrder),
      active: item.active,
      imageKey: item.imageKey,
    });
    setFormError(null);
    setImageDimensions(null);
    setImageFit(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen || !form.imageKey) return;
    const url = clientGalleryImageUrl(form.imageKey);
    if (!url) return;
    void applyImageMeta(url);
  }, [modalOpen, form.imageKey, applyImageMeta]);

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImageDimensions(null);
    setImageFit(null);
  };

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    setImageUploading(true);
    setFormError(null);
    try {
      await applyImageMeta(file);
      const { imageKey } = await uploadClientGalleryImage(file);
      setForm((f) => ({ ...f, imageKey }));
      pushToast("Imagem carregada.", "success");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Falha no upload.");
      setImageDimensions(null);
      setImageFit(null);
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    const title = form.title.trim();
    if (title.length < 2) {
      setFormError("Indica um título (mín. 2 caracteres).");
      return;
    }
    if (!form.imageKey.trim()) {
      setFormError("Carrega uma imagem.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const sortOrder = Number.parseInt(form.sortOrder || "0", 10) || 0;
      const payload = {
        title,
        description: form.description.trim() || undefined,
        imageKey: form.imageKey,
        active: form.active,
        sortOrder,
      };

      if (editingId) {
        await updateClientGalleryItem(editingId, payload);
        pushToast("Slide actualizado.", "success");
      } else {
        await createClientGalleryItem(payload);
        pushToast("Slide adicionado à galeria.", "success");
      }

      closeModal();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteClientGalleryItem(confirmDeleteId);
      pushToast("Slide removido.", "success");
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Não foi possível eliminar.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (item: ClientGalleryItem) => {
    try {
      await updateClientGalleryItem(item.id, { active: !item.active });
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Erro ao actualizar.", "error");
    }
  };

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Galeria · área cliente</h1>
          <p className="mt-1 max-w-xl text-[13px] text-zinc-400">
            Slideshow na página inicial da conta. Só slides activos aparecem aos clientes.
          </p>
          {!loading ? (
            <p className="mt-2 text-[11px] text-zinc-500">
              {items.length} slide{items.length !== 1 ? "s" : ""} · {activeCount} activo
              {activeCount !== 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2.5 text-[12px] font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
        >
          Novo slide
        </button>
      </header>

      <GallerySpecPanel />

      {toast ? (
        <div
          role="status"
          className={`rounded-lg px-3 py-2 text-[12px] ${
            toast.tone === "success"
              ? "border border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
              : "border border-red-500/30 bg-red-950/50 text-red-200"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-[13px] text-red-200" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-[16/9] animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">Ainda não há slides na galeria.</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg bg-amber-400/15 px-4 py-2 text-[12px] font-semibold text-amber-300 ring-1 ring-amber-400/25 transition hover:bg-amber-400/20"
          >
            Adicionar o primeiro
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/50"
            >
              <div className="relative aspect-[16/9] bg-zinc-950">
                <img
                  src={clientGalleryImageUrl(item.imageKey)}
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
                {!item.active ? (
                  <span className="absolute left-2 top-2 rounded-md bg-zinc-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 ring-1 ring-white/10">
                    Inactivo
                  </span>
                ) : null}
              </div>
              <div className="space-y-1 p-3">
                <p className="truncate text-[13px] font-semibold text-zinc-100">{item.title}</p>
                {item.description ? (
                  <p className="line-clamp-2 text-[11px] text-zinc-500">{item.description}</p>
                ) : null}
                <p className="text-[10px] text-zinc-600">Ordem {item.sortOrder}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-800/80 px-3 py-2">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold text-zinc-300 ring-1 ring-zinc-700 transition hover:bg-zinc-800"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(item)}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-800 transition hover:bg-zinc-800"
                >
                  {item.active ? "Desactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(item.id)}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold text-red-400/90 ring-1 ring-red-500/20 transition hover:bg-red-950/40"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-title`}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <h2 id={`${baseId}-title`} className="text-lg font-bold text-zinc-100">
              {editingId ? "Editar slide" : "Novo slide"}
            </h2>

            <div className="mt-3">
              <GallerySpecPanel compact />
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Título
                </span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Descrição (opcional)
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Imagem
                </span>
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  {!form.imageKey ? (
                    <button
                      type="button"
                      disabled={imageUploading}
                      onClick={() => imageInputRef.current?.click()}
                      className="flex min-h-[7.5rem] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-600 bg-zinc-900/50 px-4 py-6 text-center transition hover:border-amber-500/40 hover:bg-zinc-900 disabled:opacity-50 sm:w-auto sm:min-w-[14rem]"
                    >
                      <span className="text-[11px] font-semibold text-zinc-300">
                        {imageUploading ? "A carregar…" : "Carregar imagem"}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        Recomendado {CLIENT_GALLERY_SPEC.idealLabel} ·{" "}
                        {CLIENT_GALLERY_SPEC.idealSize}
                      </span>
                    </button>
                  ) : null}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => void handleImagePick(e.target.files?.[0])}
                  />
                  {form.imageKey ? (
                    <div className="min-w-0 flex-1">
                      <GalleryPreviewFrame
                        imageUrl={clientGalleryImageUrl(form.imageKey)!}
                        fit={imageFit}
                        dimensions={imageDimensions}
                      />
                      <button
                        type="button"
                        disabled={imageUploading}
                        onClick={() => imageInputRef.current?.click()}
                        className="mt-2 rounded-lg border border-zinc-700 px-3 py-2 text-[11px] font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {imageUploading ? "A carregar…" : "Substituir imagem"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Ordem
                  </span>
                  <input
                    inputMode="numeric"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sortOrder: sanitizeUnsignedIntString(e.target.value),
                      }))
                    }
                    className="mt-1 w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
                <label className="flex items-center gap-2 self-end pb-2">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="rounded border-zinc-600"
                  />
                  <span className="text-[12px] text-zinc-300">Visível na área cliente</span>
                </label>
              </div>

              {formError ? (
                <p className="text-[12px] text-red-400" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg px-4 py-2 text-[12px] font-semibold text-zinc-400 transition hover:text-zinc-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || imageUploading}
                className="rounded-lg bg-amber-400 px-4 py-2 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-200">Eliminar este slide da galeria?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="rounded-lg px-3 py-2 text-[12px] text-zinc-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-[12px] font-semibold text-white"
              >
                {deleting ? "…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
