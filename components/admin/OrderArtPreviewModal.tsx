"use client";

/* eslint-disable @next/next/no-img-element -- arte e anexos com blob / URLs assinadas */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOrderLatestArtBlob,
  fetchOrderModelagemFileBlob,
  getOrder,
  listOrderModelagemFiles,
  type OrderDetail,
  type OrderModelagemFile,
} from "@/lib/api-client";
import { buildDesignerPhotoshopBundleZip } from "@/lib/designer-photoshop-bundle";
import { contaPedidoModelagemPath } from "@/lib/routes";
import {
  describeDraftResponsibleLine,
  formatModelagemSavedAt,
  getLatestArtVersion,
} from "@/lib/modelagem-authorship";
import { loadSession } from "@/lib/auth-session";
import { DesignerResponsibleBanner } from "@/components/order/DesignerResponsibleBanner";
import { isStaffRole } from "@/lib/routes";

export type OrderArtPreviewTarget = {
  orderId: string;
  orderNumber: string;
};

type Props = {
  open: boolean;
  target: OrderArtPreviewTarget | null;
  onClose: () => void;
  /** Toast / aviso rápido na página pai (ex.: ferramentas do designer). */
  onNotify?: (message: string) => void;
};

function isImageMime(m: string) {
  return m.startsWith("image/");
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function OrderArtPreviewModal({
  open,
  target,
  onClose,
  onNotify,
}: Props) {
  const orderId = target?.orderId ?? null;
  const orderNumber = target?.orderNumber ?? "";

  const revokeRef = useRef<string[]>([]);

  const revokeAll = useCallback(() => {
    revokeRef.current.forEach((u) => URL.revokeObjectURL(u));
    revokeRef.current = [];
  }, []);

  const pushUrl = useCallback((u: string) => {
    revokeRef.current.push(u);
    return u;
  }, []);

  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [compositionUrl, setCompositionUrl] = useState<string | null>(null);
  const [compositionNote, setCompositionNote] = useState<string | null>(null);
  const [clientFiles, setClientFiles] = useState<OrderModelagemFile[]>([]);
  const [fileThumbUrl, setFileThumbUrl] = useState<Record<string, string>>({});
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    if (!open) setZipBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open || !orderId) {
      return undefined;
    }

    let cancelled = false;
    revokeAll();
    setCompositionUrl(null);
    setCompositionNote(null);
    setDetail(null);
    setLoadErr(null);
    setClientFiles([]);
    setFileThumbUrl({});
    setBusy(true);

    const runOrderId = orderId;

    async function run() {
      try {
        const [d, files] = await Promise.all([
          getOrder(runOrderId),
          listOrderModelagemFiles(runOrderId).catch(
            () => [] as OrderModelagemFile[],
          ),
        ]);
        if (cancelled) return;
        setDetail(d);
        setClientFiles(files);

        try {
          const blob = await fetchOrderLatestArtBlob(runOrderId);
          if (cancelled) return;
          const u = pushUrl(URL.createObjectURL(blob));
          setCompositionUrl(u);
          setCompositionNote(null);
        } catch {
          if (!cancelled) {
            setCompositionNote(
              "Ainda não existe composição PNG guardada neste pedido.",
            );
          }
        }

        const imageRows = files
          .filter((f) => isImageMime(f.mimeType))
          .slice(0, 14);
        const thumbs: Record<string, string> = {};
        await Promise.all(
          imageRows.map(async (f) => {
            try {
              const b = await fetchOrderModelagemFileBlob(runOrderId, f.id);
              if (cancelled) return;
              const url = pushUrl(URL.createObjectURL(b));
              thumbs[f.id] = url;
            } catch {
              /* ignore thumbnails */
            }
          }),
        );
        if (!cancelled) setFileThumbUrl(thumbs);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(
            e instanceof Error ? e.message : "Não foi possível carregar o pedido.",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
      revokeAll();
    };
  }, [open, orderId, revokeAll, pushUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function openClientFileBlob(f: OrderModelagemFile) {
    if (!orderId) return;
    try {
      const blob = await fetchOrderModelagemFileBlob(orderId, f.id);
      const u = URL.createObjectURL(blob);
      window.open(u, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(u), 120_000);
    } catch {
      /* silently */
    }
  }

  const downloadZipPack = useCallback(async () => {
    if (!orderId) return;
    setZipBusy(true);
    try {
      const blob = await buildDesignerPhotoshopBundleZip({
        orderId,
        orderNumber,
      });
      const fname =
        `${orderNumber.replace(/[^\w.-]+/g, "_") || orderId.slice(0, 8)}-photoshop.zip`;
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        onNotify?.("Pacote ZIP descarregado.");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      onNotify?.(
        e instanceof Error ? e.message : "Não foi possível gerar o ZIP.",
      );
    } finally {
      setZipBusy(false);
    }
  }, [orderId, orderNumber, onNotify]);

  const lastArt = detail ? getLatestArtVersion(detail.artVersions) : undefined;
  const draftResponsible =
    detail?.status === "DRAFT" ? describeDraftResponsibleLine(detail) : "";
  const viewerRole = loadSession()?.user?.role ?? "";
  const showStaffArtActions = isStaffRole(viewerRole);

  if (!open || !target) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`art-prev-title-${target.orderId}`}
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={onClose}
      />

      <div className="relative mx-auto flex w-full min-w-0 max-h-[calc(100vh-3rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl ring-1 ring-white/[0.05] sm:max-h-[calc(100vh-4rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] bg-black/60 px-4 py-3">
          <div className="min-w-0">
            <h2
              id={`art-prev-title-${target.orderId}`}
              className="truncate text-base font-semibold text-white"
            >
              Arte · {orderNumber}
            </h2>
            {lastArt ? (
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                <span className="font-medium text-zinc-300">
                  {lastArt.createdBy?.name?.trim() || "Utilizador"}
                </span>
                {" · v"}
                <span className="tabular-nums">{lastArt.versionIndex}</span>
                {" · "}
                <span className="tabular-nums text-zinc-400">
                  {formatModelagemSavedAt(lastArt.createdAt)}
                </span>
              </p>
            ) : draftResponsible ? (
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                <span className="font-medium text-amber-300/90">Rascunho.</span>{" "}
                {draftResponsible}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
            aria-label="Fechar janela"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!busy && !loadErr && detail && orderId ? (
          <>
            {showStaffArtActions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-zinc-950/88 px-4 py-2 backdrop-blur-md">
                <button
                  type="button"
                  disabled={zipBusy}
                  title="Um único ZIP: PNG da composição, foto do modelo e referências — sem repetir texto na página."
                  onClick={() => void downloadZipPack()}
                  className="rounded-lg bg-teal-500/15 px-3 py-1.5 text-[11px] font-semibold text-teal-100 ring-1 ring-teal-400/30 transition hover:bg-teal-500/25 hover:text-white disabled:cursor-wait disabled:opacity-55"
                >
                  {zipBusy ? "ZIP…" : "Descarregar ZIP"}
                </button>
                <Link
                  href={contaPedidoModelagemPath(orderId)}
                  title="Equipa (designer/admin): o regresso ao fluxo interno é pela barra superior do editor ou pela ligação «Ferramentas de designer» — não use a área «Os meus pedidos» do cliente."
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-white/[0.1] transition hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  Editor web
                </Link>
              </div>
            ) : null}
            <div className="shrink-0 border-b border-white/[0.06] bg-zinc-950/92 px-4 py-2">
              <DesignerResponsibleBanner
                designer={detail.designer}
                viewerRole={viewerRole}
                viewerId={loadSession()?.user.id ?? ""}
              />
            </div>
          </>
        ) : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
          {busy && (
            <p className="text-sm text-zinc-500">A carregar arte e ficheiros…</p>
          )}

          {loadErr && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {loadErr}
            </div>
          )}

          {!busy && !loadErr && (
            <>
              <section className="mb-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Composição guardada
                </h3>
                <div className="mt-2 min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-black/35">
                  <div className="flex w-full min-w-0 items-center justify-center bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:14px_14px] p-2 sm:p-3">
                    {compositionUrl ? (
                      <img
                        src={compositionUrl}
                        alt={`Composição do pedido ${orderNumber}`}
                        decoding="async"
                        className="block h-auto max-h-[min(52vh,520px)] w-auto min-w-0 max-w-full object-contain object-center"
                      />
                    ) : (
                      <p className="py-8 text-center text-sm text-zinc-500">
                        {compositionNote ?? "Sem dados de composição."}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Referências do cliente
                </h3>

                {clientFiles.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-600">
                    Nenhum ficheiro de referência neste pedido.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {clientFiles.map((f) => {
                      const thumb = fileThumbUrl[f.id];
                      return (
                        <li
                          key={f.id}
                          className="flex gap-2.5 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5"
                        >
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/[0.05]">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="max-h-full max-w-full object-contain object-center"
                              />
                            ) : (
                              <span className="px-2 text-center text-[10px] font-medium uppercase text-zinc-500">
                                {f.mimeType.includes("pdf") ? "PDF" : "Ficheiro"}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-zinc-200" title={f.originalName}>
                              {f.originalName}
                            </p>
                            <p className="mt-0.5 text-[10px] text-zinc-600">
                              {formatWhen(f.createdAt)}
                            </p>
                            <button
                              type="button"
                              onClick={() => void openClientFileBlob(f)}
                              className="mt-1 text-[11px] font-semibold text-amber-400/90 hover:text-amber-300"
                            >
                              Abrir
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
