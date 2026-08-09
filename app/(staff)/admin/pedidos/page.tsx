"use client";

/* eslint-disable @next/next/no-img-element -- pré-visualização de comprovativo (blob URL) */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminChangeOrderStatus,
  adminListOrders,
  fetchOrderPaymentProofBlob,
  getOrder,
  getOrderAllowedTransitions,
  getUnreadCounts,
  type AdminOrderListRow,
  type OrderDetail,
  type OrderListItem,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodValue,
} from "@/lib/api-client";
import { APPAREL_PRODUCT_TYPES } from "@/lib/apparel-catalog";
import {
  OrderArtPreviewModal,
  type OrderArtPreviewTarget,
} from "@/components/admin/OrderArtPreviewModal";
import { orderStatusLabel } from "@/lib/order-status";
import { formatMoney } from "@/lib/format-money";
import { issueAndDeliverOrderDocument } from "@/lib/order-document-flow";
import { InvoiceDocumentPicker } from "@/components/documents/InvoiceDocumentPicker";
import {
  documentPrimaryActionLabel,
  documentUsesDownloadDelivery,
  invoiceDocumentContextFromOrder,
  suggestInvoiceDocumentModel,
} from "@/lib/invoice-document-policy";
import { useInvoiceDocumentModel } from "@/lib/use-invoice-document-model";
import { contaPedidoModelagemPath, isStaffRole, ROUTES, staffMayViewOrderArtInPedidosPanel } from "@/lib/routes";
import {
  describeDraftResponsibleLine,
  formatModelagemSavedAt,
  getLatestArtVersion,
} from "@/lib/modelagem-authorship";
import { ChatBox } from "@/components/chat/ChatBox";
import { loadSession } from "@/lib/auth-session";

/* ─── helpers ──────────────────────────────────────────────── */

function formatDate(d: string) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));
}

/** Lista: data e hora em duas linhas para leitura rápida. */
function formatPedidoListDateParts(iso: string): { day: string; time: string } {
  const dt = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(dt),
    time: new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt),
  };
}

/** Texto auxiliar alinhado às regras de transição por perfil (API). */
function estadoAvancoHintForRole(role: string | undefined): string | null {
  switch (role) {
    case "ATTENDANT":
      return "Como atendente podes colocar em validação de pagamento e, em «Finalizado», marcar entregue (toda a equipa pode registar a entrega).";
    case "DESIGNER":
      return "Como designer geres aprovação, produção e finalizado; a entrega ao cliente pode ser registada por qualquer perfil da equipa quando o pedido estiver finalizado.";
    case "ADMIN":
      return "Como administrador tens acesso a todas as transições do fluxo.";
    default:
      return null;
  }
}

function orderAmount(o: OrderListItem): number {
  const raw = o.totalAmount;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return parseFloat(raw.replace(",", ".")) || 0;
  return Number(raw) || 0;
}

function productionProcessLabel(p: string): string {
  if (p === "SUBLIMATION") return "Sublimação";
  if (p === "DTF") return "DTF";
  if (p === "STORE_RETAIL") return "Venda balcão (insumo)";
  return p;
}

/** Balcão com linhas apenas STORE_RETAIL: venda na hora, sem pipeline de produção téxtil. */
function isBalcaoInstantInsumosOrder(d: {
  orderOrigin?: string | null;
  items?: { productionProcess?: string }[];
} | null): boolean {
  if (!d || d.orderOrigin !== "BALCAO") return false;
  const items = d.items;
  if (!items?.length) return false;
  return items.every((it) => it.productionProcess === "STORE_RETAIL");
}

function garmentTypeLabel(code: string | undefined): string {
  if (!code?.trim()) return "—";
  const found = APPAREL_PRODUCT_TYPES.find((x) => x.id === code);
  return found?.label ?? code.replace(/_/g, " ");
}

function orderLineMeta(meta: Record<string, unknown> | null | undefined): {
  garment: string;
  color: string;
  size: string;
  sku: string;
} {
  if (!meta || typeof meta !== "object") {
    return { garment: "—", color: "—", size: "—", sku: "—" };
  }
  const garmentBase = garmentTypeLabel(
    typeof meta.garmentType === "string" ? meta.garmentType : undefined,
  );
  const ageRaw = meta.ageBand;
  const ageSuffix =
    typeof ageRaw === "string"
      ? ageRaw === "CHILD"
        ? " · infantil"
        : ageRaw === "ADULT"
          ? " · adulto"
          : ` · ${ageRaw.toLowerCase()}`
      : "";
  const garment =
    garmentBase === "—" && !ageSuffix
      ? "—"
      : garmentBase === "—"
        ? ageSuffix.replace(/^ · /, "")
        : `${garmentBase}${ageSuffix}`;
  const color =
    typeof meta.baseColor === "string" && meta.baseColor.trim()
      ? meta.baseColor.trim()
      : "—";
  const size =
    typeof meta.size === "string" && meta.size.trim() ? meta.size.trim() : "—";
  const sku =
    typeof meta.sku === "string" && meta.sku.trim() ? meta.sku.trim() : "—";
  return { garment, color, size, sku };
}

function rowSurfaceClass(
  o: OrderListItem,
  unread: number,
  isSelected: boolean,
  /** Sem realces ligados a valor em falta (ex.: perfil designer). */
  skipMoneyHighlight?: boolean,
): string {
  const base =
    "group cursor-pointer transition-colors border-l-[3px] border-solid";
  if (isSelected) {
    return `${base} border-l-amber-400 bg-amber-400/[0.08] hover:bg-amber-400/[0.12]`;
  }
  if (unread > 0) {
    return `${base} border-l-sky-400 bg-sky-500/[0.06] hover:bg-sky-500/[0.1]`;
  }
  if (o.status === "DRAFT") {
    return `${base} border-l-zinc-600 bg-zinc-500/[0.04] hover:bg-zinc-800/35`;
  }
  if (
    !skipMoneyHighlight &&
    orderAmount(o) <= 0 &&
    o.status !== "CANCELLED"
  ) {
    return `${base} border-l-amber-500/80 bg-amber-500/[0.05] hover:bg-amber-500/[0.09]`;
  }
  return `${base} border-l-transparent hover:bg-zinc-800/30`;
}

/** Ordem oficial das fases no fluxo (exclui cancelamento). */
const PIPELINE_PHASES = [
  "DRAFT",
  "SUBMITTED",
  "VALIDATION_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
  "DELIVERED",
] as const;

function pipelinePhaseIndex(status: string): number {
  return PIPELINE_PHASES.indexOf(status as (typeof PIPELINE_PHASES)[number]);
}

/** Linha visual das 7 fases — lista (compacta) ou painel de detalhe. */
function OrderPhaseStrip({
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
        apenas materiais/insumos; não há fases de modelagem ou produção téxtil. O
        estado do pedido reflecte pagamento e conclusão da venda.
        {status === "DRAFT" ? (
          <span className="mt-1 block text-emerald-200/85">
            Ao finalizar o pagamento no PDV, o pedido passa directamente a concluído
            (entregue).
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

/** Cor sólida para barra de mistura de estados (hero). */
function statusSegmentSolidClass(s: string): string {
  switch (s) {
    case "DRAFT":
      return "bg-zinc-500";
    case "SUBMITTED":
      return "bg-amber-500";
    case "VALIDATION_PAYMENT":
      return "bg-blue-500";
    case "APPROVED":
      return "bg-violet-500";
    case "IN_PRODUCTION":
      return "bg-cyan-500";
    case "FINISHED":
      return "bg-sky-500";
    case "DELIVERED":
      return "bg-emerald-500";
    case "CANCELLED":
      return "bg-red-500";
    default:
      return "bg-zinc-600";
  }
}

function statusColor(s: string) {
  switch (s) {
    case "DRAFT":
      return "bg-zinc-700/50 text-zinc-400 ring-zinc-600/30";
    case "SUBMITTED":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/25";
    case "VALIDATION_PAYMENT":
      return "bg-blue-500/15 text-blue-300 ring-blue-500/25";
    case "APPROVED":
      return "bg-violet-500/15 text-violet-300 ring-violet-500/25";
    case "IN_PRODUCTION":
      return "bg-cyan-500/15 text-cyan-300 ring-cyan-500/25";
    case "FINISHED":
      return "bg-sky-500/15 text-sky-300 ring-sky-500/25";
    case "DELIVERED":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25";
    case "CANCELLED":
      return "bg-red-500/15 text-red-300 ring-red-500/25";
    default:
      return "bg-zinc-700/40 text-zinc-400 ring-zinc-600/20";
  }
}

function paymentMethodRequiresProof(pm: PaymentMethodValue | null | undefined): boolean {
  return (
    pm === "BANK_TRANSFER_SAME" ||
    pm === "DEPOSIT" ||
    pm === "BANK_TRANSFER_EXPRESS"
  );
}

/** Pré-visualização do comprovativo enviado pelo cliente no submit (transferência / depósito). */
function PaymentProofReview({ order }: { order: OrderListItem }) {
  const pm = order.paymentMethod as PaymentMethodValue | undefined;
  const requiresProof = pm ? paymentMethodRequiresProof(pm) : false;
  const hasProof = Boolean(order.paymentProofKey);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!pm || !hasProof) {
      setBlobUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const blob = await fetchOrderPaymentProofBlob(order.id);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (e) {
        if (!cancelled) {
          setBlobUrl(null);
          setError(e instanceof Error ? e.message : "Não foi possível carregar o ficheiro.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [order.id, hasProof, reloadKey, pm]);

  if (!pm) return null;

  const mime = order.paymentProofMime ?? "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime.includes("pdf");

  return (
    <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-950/25 via-black/25 to-black/30 px-4 py-3 ring-1 ring-amber-400/10">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/85">
            Comprovativo de pagamento
          </p>
          <p className="mt-1 max-w-[280px] text-[11px] leading-snug text-zinc-500 sm:max-w-none">
            Verifica se o valor e os dados correspondem ao pedido antes de aprovar ou passar para produção.
          </p>
        </div>
      </div>

      {!requiresProof ? (
        <p className="rounded-lg border border-zinc-700/50 bg-zinc-950/40 px-3 py-2 text-[11px] text-zinc-400">
          Pagamento presencial ou método sem upload obrigatório — não há comprovativo digital neste pedido.
        </p>
      ) : !hasProof ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
          O cliente não anexou ficheiro neste pedido (situação invulgar para transferência). Confirma com o cliente antes de aceitar.
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
          <p className="text-[11px] text-zinc-500">A carregar comprovativo…</p>
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="rounded-lg bg-red-950/35 px-3 py-2 text-[11px] text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-[11px] font-medium text-amber-400 underline-offset-2 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : blobUrl ? (
        <div className="space-y-3">
          {order.paymentProofName ? (
            <p className="truncate text-[11px] text-zinc-400" title={order.paymentProofName}>
              <span className="font-medium text-zinc-300">Ficheiro:</span> {order.paymentProofName}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a
              href={blobUrl}
              download={order.paymentProofName ?? "comprovativo"}
              className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.1]"
            >
              Descarregar cópia
            </a>
            {isPdf ? (
              <a
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-400/18"
              >
                Abrir PDF noutro separador
              </a>
            ) : null}
          </div>
          {isImage ? (
            <img
              src={blobUrl}
              alt="Comprovativo de pagamento"
              className="max-h-[min(280px,45vh)] w-full rounded-lg border border-white/[0.08] bg-black/40 object-contain object-center"
            />
          ) : isPdf ? (
            <iframe
              title="Comprovativo PDF"
              src={blobUrl}
              className="h-[min(320px,45vh)] w-full rounded-lg border border-white/[0.08] bg-zinc-950"
            />
          ) : (
            <p className="text-[11px] text-zinc-500">
              Pré-visualização não disponível para este tipo — usa Descarregar cópia.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Painel de detalhe lateral ─────────────────────────────── */
function OrderDetailPanel({
  order,
  onClose,
  onStatusChange,
  hidePaymentAndMoney,
}: {
  order: OrderListItem;
  onClose: () => void;
  onStatusChange: (orderId: string, status: string) => Promise<void>;
  /** Designer: sem valores, método de pagamento, comprovativos ou anexos financeiros. */
  hidePaymentAndMoney: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [allowedNext, setAllowedNext] = useState<string[]>([]);
  const [loadingTransitions, setLoadingTransitions] = useState(true);
  const [panelIn, setPanelIn] = useState(false);
  const [receiptPrinting, setReceiptPrinting] = useState(false);
  const [receiptPrintErr, setReceiptPrintErr] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(true);
  const [orderDetailErr, setOrderDetailErr] = useState<string | null>(null);
  const [artPreview, setArtPreview] = useState<OrderArtPreviewTarget | null>(
    null,
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setPanelIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setReceiptPrintErr(null);
    setReceiptPrinting(false);
  }, [order.id]);

  const invoiceDocContext = useMemo(
    () =>
      invoiceDocumentContextFromOrder(
        orderDetail ?? {
          status: order.status,
          paymentMethod: order.paymentMethod,
          orderOrigin: order.orderOrigin,
        },
      ),
    [
      orderDetail,
      order.status,
      order.paymentMethod,
      order.orderOrigin,
    ],
  );

  const {
    model: invoiceDocModel,
    setModel: setInvoiceDocModel,
    validation: invoiceDocValidation,
    canIssue: canIssueInvoiceDoc,
  } = useInvoiceDocumentModel(
    invoiceDocContext,
    order.id,
    orderDetail?.lastDocumentModel ?? order.lastDocumentModel,
  );

  useEffect(() => {
    let cancelled = false;
    setOrderDetail(null);
    setOrderDetailErr(null);
    setOrderDetailLoading(true);
    (async () => {
      try {
        const d = await getOrder(order.id);
        if (!cancelled) setOrderDetail(d);
      } catch (e) {
        if (!cancelled) {
          setOrderDetailErr(
            e instanceof Error ? e.message : "Não foi possível carregar as linhas.",
          );
        }
      } finally {
        if (!cancelled) setOrderDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadTransitions() {
      setLoadingTransitions(true);
      setErr(null);
      try {
        const res = await getOrderAllowedTransitions(order.id);
        if (!cancelled) {
          setAllowedNext(res.allowedNext ?? []);
        }
      } catch {
        if (!cancelled) {
          setAllowedNext([]);
          setErr("Não foi possível carregar as acções disponíveis.");
        }
      } finally {
        if (!cancelled) setLoadingTransitions(false);
      }
    }
    void loadTransitions();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.status]);

  async function printPaymentReceipt() {
    if (!canIssueInvoiceDoc) {
      setReceiptPrintErr(
        invoiceDocValidation.error ?? "Modelo de documento inválido para este pedido.",
      );
      return;
    }
    setReceiptPrinting(true);
    setReceiptPrintErr(null);
    try {
      const detail = await getOrder(order.id);
      const sess = loadSession();
      await issueAndDeliverOrderDocument(detail, {
        attendantLabel:
          sess?.user?.name?.trim() || sess?.user?.email?.trim() || undefined,
        documentModel: invoiceDocModel,
      });
    } catch (e) {
      setReceiptPrintErr(
        e instanceof Error
          ? e.message
          : documentUsesDownloadDelivery(invoiceDocModel)
            ? "Não foi possível descarregar o PDF."
            : "Não foi possível imprimir.",
      );
    } finally {
      setReceiptPrinting(false);
    }
  }

  async function doTransition(next: string) {
    setBusy(next); setErr(null);
    try {
      await onStatusChange(order.id, next);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro na transição.");
    } finally { setBusy(null); }
  }

  const estadoAvancoHint = estadoAvancoHintForRole(loadSession()?.user?.role);
  const sessionRole = loadSession()?.user?.role ?? "";
  const sessionUserId = loadSession()?.user?.id;
  const hideArtAndEditor =
    isStaffRole(sessionRole) &&
    !staffMayViewOrderArtInPedidosPanel(
      sessionRole,
      sessionUserId,
      order.attendant?.id ?? null,
    );

  const balcaoInsumosOnly = useMemo(() => {
    if (orderDetail?.items?.length) {
      return isBalcaoInstantInsumosOrder(orderDetail);
    }
    return isBalcaoInstantInsumosOrder(order);
  }, [orderDetail, order]);

  return (
    <>
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-md transition-opacity duration-300 ease-out ${panelIn ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-white/[0.08] bg-zinc-950/98 shadow-[-24px_0_48px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04] transition-transform duration-300 ease-out ${panelIn ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="h-[2px] shrink-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-zinc-950/95 px-5 py-4 backdrop-blur-md">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-semibold uppercase tracking-wide text-amber-400/95">
              {order.orderNumber}
              {order.orderOrigin === "BALCAO" ? (
                <span className="ml-2 rounded border border-teal-500/35 bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-wide text-teal-200">
                  Balcão
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] text-zinc-500">{order.client.name}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l10 10M11 1L1 11"/></svg>
          </button>
        </div>

        <div className="space-y-4 px-5 pb-8 pt-4">
          {/* Estado actual */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusColor(order.status)}`}>
              {orderStatusLabel(order.status)}
            </span>
            <span className="text-[11px] text-zinc-600">Actualizado · {formatDate(order.updatedAt)}</span>
          </div>

          <OrderPhaseStrip
            status={order.status}
            balcaoInsumosOnly={balcaoInsumosOnly}
          />

          {order.status === "DELIVERED" ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-xs ring-1 ring-emerald-500/10">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">
                Entrega ao cliente
              </p>
              {(orderDetail ?? order).deliveredAt ? (
                <>
                  <p className="text-zinc-200">
                    <span className="text-zinc-500">Registada por </span>
                    <span className="font-medium text-emerald-200">
                      {(orderDetail ?? order).deliveredBy?.name?.trim() || "—"}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {formatDate(String((orderDetail ?? order).deliveredAt))}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  Pedido entregue (sem registo de responsável — pedidos anteriores à actualização do sistema).
                </p>
              )}
            </div>
          ) : null}

          {!hidePaymentAndMoney ? (
            <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Valor total</p>
              <span className="text-xl font-bold text-amber-300 tabular-nums">
                {formatMoney(order.totalAmount, order.currency)}
              </span>
            </div>
          ) : null}

          {/* Info cliente */}
          <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3 text-xs space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Cliente</p>
            <p className="text-zinc-300">{order.client.name}</p>
            <p className="text-zinc-500">{order.client.email}</p>
          </div>

          {/* Produção: linhas e (para não-atendente) acesso à arte / editor */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-950/15 px-4 py-3 ring-1 ring-violet-400/10">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
              {hideArtAndEditor ? "Produção" : "Produção e arte"}
            </p>
            {!hideArtAndEditor ? (
              balcaoInsumosOnly ? (
                <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                  Este pedido é apenas{" "}
                  <span className="font-semibold text-zinc-400">
                    venda de materiais / insumos ao balcão
                  </span>
                  . Não há composição de arte no editor nem ficheiros de modelagem por artigo — por linha só existem nome, quantidade e preço no pedido.
                </p>
              ) : (
              <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Link
                  href={contaPedidoModelagemPath(order.id)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400/90 to-amber-500/90 px-3 py-2 text-[11px] font-bold text-zinc-950 shadow-sm shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Editor web
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setArtPreview({
                      orderId: order.id,
                      orderNumber: order.orderNumber,
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/35 bg-violet-500/15 px-3 py-2 text-[11px] font-semibold text-violet-100 ring-1 ring-violet-400/20 transition hover:bg-violet-500/25 hover:text-white"
                >
                  Ver arte e ficheiros
                </button>
              </div>
              {!orderDetailLoading && orderDetail
                ? (() => {
                    const latest = getLatestArtVersion(orderDetail.artVersions);
                    if (latest) {
                      return (
                        <div className="mb-3 rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-[11px] text-zinc-300">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-violet-400/85">
                            Última composição no editor
                          </p>
                          <p className="mt-1">
                            <span className="font-medium text-zinc-100">
                              {latest.createdBy?.name?.trim() || "—"}
                            </span>
                            {" · "}
                            versão{" "}
                            <span className="tabular-nums">{latest.versionIndex}</span>
                            {" · "}
                            <span className="text-zinc-500">
                              {formatModelagemSavedAt(latest.createdAt)}
                            </span>
                          </p>
                        </div>
                      );
                    }
                    if (order.status === "DRAFT") {
                      const t = describeDraftResponsibleLine(order);
                      return (
                        <div className="mb-3 rounded-lg border border-zinc-600/40 bg-black/25 px-3 py-2 text-[11px] text-zinc-400">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                            Rascunho
                          </p>
                          <p className="mt-1 text-zinc-300">
                            {t || "Ainda sem gravações no editor."}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <p className="mb-3 text-[11px] text-zinc-600">
                        Sem composição gravada no editor.
                      </p>
                    );
                  })()
                : null}
              </>
              )
            ) : null}
            <p className="mb-2 text-[11px] text-zinc-500">
              {hideArtAndEditor ? (
                <>
                  {order._count.items} linha{order._count.items !== 1 ? "s" : ""} no pedido
                </>
              ) : (
                <>
                  {order._count.items} linha{order._count.items !== 1 ? "s" : ""} ·{" "}
                  {order._count.artVersions} versão(ões) gravada(s) no editor
                </>
              )}
            </p>
            {orderDetailLoading ? (
              <div className="flex items-center gap-2 py-4 text-[11px] text-zinc-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-400" />
                A carregar artigos…
              </div>
            ) : orderDetailErr ? (
              <p className="rounded-lg bg-red-950/35 px-3 py-2 text-[11px] text-red-300" role="alert">
                {orderDetailErr}
              </p>
            ) : orderDetail && orderDetail.items.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/25">
                <table className="w-full min-w-[20rem] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-zinc-500">
                      <th className="px-2.5 py-2 font-medium">Produto</th>
                      <th className="px-2.5 py-2 font-medium whitespace-nowrap">Tipo</th>
                      <th className="px-2.5 py-2 font-medium whitespace-nowrap">Cor</th>
                      <th className="px-2.5 py-2 font-medium whitespace-nowrap">Tam.</th>
                      <th className="px-2.5 py-2 font-medium whitespace-nowrap">Processo</th>
                      <th className="px-2.5 py-2 text-right font-medium tabular-nums">Qtd</th>
                      {!hidePaymentAndMoney ? (
                        <th className="px-2.5 py-2 text-right font-medium whitespace-nowrap">P. unit.</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                    {orderDetail.items.map((line) => {
                      const meta = orderLineMeta(
                        line.metadata as Record<string, unknown> | null | undefined,
                      );
                      const skuShow =
                        meta.sku !== "—"
                          ? meta.sku
                          : line.skuCode?.trim()
                            ? line.skuCode
                            : "—";
                      return (
                        <tr key={line.id} className="align-top">
                          <td className="max-w-[11rem] px-2.5 py-2 font-medium text-white leading-snug">
                            {line.productName}
                            {skuShow !== "—" ? (
                              <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                                SKU: {skuShow}
                              </span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-zinc-400">{meta.garment}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-zinc-400">{meta.color}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-zinc-400">{meta.size}</td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-zinc-400">
                            {productionProcessLabel(line.productionProcess)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums">{line.quantity}</td>
                          {!hidePaymentAndMoney ? (
                            <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-amber-200/90">
                              {formatMoney(line.unitPrice, order.currency)}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">Sem linhas de artigo registadas.</p>
            )}
          </div>

          {/* Método de pagamento, comprovantes e anexos — apenas equipa com permissão financeira */}
          {!hidePaymentAndMoney && order.paymentMethod ? (
            <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3 text-xs">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Método de pagamento</p>
              <p className="text-zinc-300">{PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethodValue] ?? order.paymentMethod}</p>
            </div>
          ) : null}

          {!hidePaymentAndMoney ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/85">
                  Documento PDF
                </p>
                <p className="mb-2.5 leading-relaxed text-[11px] text-zinc-500">
                  O sistema sugere o modelo mais adequado ao pedido.
                </p>
                <InvoiceDocumentPicker
                  id={`invoice-model-${order.id}`}
                  value={invoiceDocModel}
                  onChange={setInvoiceDocModel}
                  validation={invoiceDocValidation}
                  disabled={receiptPrinting}
                  compact
                  selectClassName="mb-2.5 w-full rounded-lg border border-zinc-600/80 bg-zinc-950/90 px-2.5 py-2 text-[12px] font-medium text-zinc-200 outline-none ring-amber-500/20 focus:border-amber-400/50 focus:ring-2"
                />
                <button
                  type="button"
                  disabled={receiptPrinting || !canIssueInvoiceDoc}
                  onClick={() => void printPaymentReceipt()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/35 bg-amber-400/15 px-3 py-2.5 text-[12px] font-semibold text-amber-200 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {receiptPrinting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-800/30 border-t-amber-200" />
                      A preparar…
                    </>
                  ) : (
                    <>
                      {documentUsesDownloadDelivery(invoiceDocModel) ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                        </svg>
                      )}
                      {documentPrimaryActionLabel(invoiceDocModel)}
                    </>
                  )}
                </button>
                {receiptPrintErr ? (
                  <p className="mt-2 text-[11px] text-red-400" role="alert">
                    {receiptPrintErr}
                  </p>
                ) : null}
              </div>
          ) : null}

          {!hidePaymentAndMoney ? <PaymentProofReview order={order} /> : null}

          {/* Notas internas podem conter valores — ocultas ao designer */}
          {!hidePaymentAndMoney && order.notes ? (
            <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3 text-xs">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Notas</p>
              <p className="text-zinc-400 leading-relaxed">{order.notes}</p>
            </div>
          ) : null}

          {/* Transições de estado (API — fonte única) */}
          {loadingTransitions ? (
            <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-6 text-center">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" />
              <p className="mt-2 text-[11px] text-zinc-500">
                A carregar acções permitidas…
              </p>
            </div>
          ) : allowedNext.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Avançar estado
              </p>
              {estadoAvancoHint ? (
                <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">{estadoAvancoHint}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {allowedNext.map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={!!busy}
                    onClick={() => void doTransition(next)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      next === "CANCELLED"
                        ? "border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/40"
                        : "border border-amber-400/20 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {busy === next ? "…" : orderStatusLabel(next)}
                  </button>
                ))}
              </div>
              {err && <p className="mt-2 text-[11px] text-red-400">{err}</p>}
            </div>
          ) : (
            err && (
              <p className="rounded-lg bg-red-950/30 px-3 py-2 text-[11px] text-red-400">
                {err}
              </p>
            )
          )}

          {/* Chat com o cliente */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Chat com o cliente</p>
            <ChatBox
              orderId={order.id}
              currentUserId={loadSession()?.user?.id ?? ""}
              peerLabel={order.client.name}
              maxH="min(320px,42vh)"
            />
          </div>

          {/* Datas */}
          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-[11px] space-y-1 text-zinc-600">
            <div className="flex justify-between"><span>Criado</span><span>{formatDate(order.createdAt)}</span></div>
            <div className="flex justify-between"><span>Atualizado</span><span>{formatDate(order.updatedAt)}</span></div>
          </div>
        </div>
      </aside>
    </div>
    {!hideArtAndEditor ? (
      <OrderArtPreviewModal
        open={artPreview !== null}
        target={artPreview}
        onClose={() => setArtPreview(null)}
      />
    ) : null}
    </>
  );
}

/* ─── KPIs e skeleton ───────────────────────────────────────── */
function PedidosKpiCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] bg-gradient-to-br p-4 ring-1 ring-white/[0.04] ${accent}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/25 text-amber-400/85">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

const STATUS_MIX_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "VALIDATION_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "FINISHED",
  "DELIVERED",
  "CANCELLED",
] as const;

function PedidosStatusMixBar({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  if (total < 1) return null;
  const segments = STATUS_MIX_ORDER.filter((st) => (counts[st] ?? 0) > 0).map(
    (st) => ({ st, n: counts[st] ?? 0 }),
  );
  if (segments.length === 0) return null;
  return (
    <div className="relative mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Distribuição por fase nesta lista
        </p>
        <p className="text-[11px] tabular-nums text-zinc-500">
          {total} pedido{total !== 1 ? "s" : ""} carregado{total !== 1 ? "s" : ""}
        </p>
      </div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800/90 ring-1 ring-white/[0.06]"
        role="img"
        aria-label="Proporção de pedidos por estado na amostra"
      >
        {segments.map(({ st, n }) => (
          <div
            key={st}
            className={`min-h-[6px] min-w-px ${statusSegmentSolidClass(st)} opacity-[0.92]`}
            style={{ flex: n }}
            title={`${orderStatusLabel(st)}: ${n}`}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-zinc-500">
        {segments.map(({ st, n }) => (
          <li key={st} className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusSegmentSolidClass(st)}`}
              aria-hidden
            />
            <span className="text-zinc-400">{orderStatusLabel(st)}</span>
            <span className="font-semibold tabular-nums text-zinc-300">{n}</span>
            <span className="tabular-nums text-zinc-600">
              ({Math.round((n / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PedidosTableSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/30 p-4 ring-1 ring-white/[0.04]">
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="h-9 w-full max-w-xs animate-pulse rounded-xl bg-zinc-800/55" />
        <div className="h-9 flex-1 min-w-[200px] animate-pulse rounded-xl bg-zinc-800/40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-zinc-950/35 px-4 py-3"
          >
            <div className="h-4 w-[88px] shrink-0 animate-pulse rounded bg-zinc-800/70" />
            <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-zinc-800/45" />
            <div className="h-6 w-[100px] shrink-0 animate-pulse rounded-md bg-zinc-800/50" />
            <div className="h-4 w-20 shrink-0 animate-pulse rounded bg-zinc-800/40" />
            <div className="h-4 w-24 shrink-0 animate-pulse rounded bg-zinc-800/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Página principal ──────────────────────────────────────── */
const FILTER_OPTIONS = [
  { label: "Todos", value: "" },
  { label: "Rascunhos", value: "DRAFT" },
  { label: "Submetidos", value: "SUBMITTED" },
  { label: "Validação e pagamento", value: "VALIDATION_PAYMENT" },
  { label: "Aprovados", value: "APPROVED" },
  { label: "Em produção", value: "IN_PRODUCTION" },
  { label: "Finalizados", value: "FINISHED" },
  { label: "Entregues", value: "DELIVERED" },
  { label: "Cancelados", value: "CANCELLED" },
];

export default function AdminPedidosPage() {
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("order");
  const statusFromUrl = searchParams.get("status");
  const [orders, setOrders] = useState<AdminOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminOrderListRow | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [listReceiptPrintingId, setListReceiptPrintingId] = useState<
    string | null
  >(null);
  const listReceiptLockRef = useRef(false);

  const hidePaymentAndMoney =
    loadSession()?.user?.role === "DESIGNER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListOrders(200, 0, true);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (statusFromUrl) setFilter(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    if (!orderIdFromUrl || orders.length === 0) return;
    const found = orders.find((o) => o.id === orderIdFromUrl);
    if (found) setSelected(found);
  }, [orderIdFromUrl, orders]);

  /* Polling de mensagens não lidas (a cada 10s) */
  useEffect(() => {
    async function fetchUnread() {
      if (orders.length === 0) return;
      try {
        const map = await getUnreadCounts(orders.map((o) => o.id));
        setUnreadMap(map);
      } catch {
        /* silencioso */
      }
    }
    void fetchUnread();
    const id = setInterval(() => void fetchUnread(), 10_000);
    return () => clearInterval(id);
  }, [orders]);

  const handleStatusChange = useCallback(async (orderId: string, status: string) => {
    await adminChangeOrderStatus(orderId, status);
    await load();
  }, [load]);

  const handleListReceiptPrint = useCallback(async (e: MouseEvent, o: OrderListItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (listReceiptLockRef.current) return;
    listReceiptLockRef.current = true;
    setListReceiptPrintingId(o.id);
    let documentModel:
      | "FACTURA_POR_FORMA"
      | "FACTURA_RECIBO"
      | "FACTURA" = "FACTURA_RECIBO";
    try {
      const detail = await getOrder(o.id);
      const sess = loadSession();
      documentModel = (
        detail.lastDocumentModel &&
        ["FACTURA_POR_FORMA", "FACTURA_RECIBO", "FACTURA"].includes(
          detail.lastDocumentModel,
        )
          ? detail.lastDocumentModel
          : suggestInvoiceDocumentModel(invoiceDocumentContextFromOrder(detail))
      ) as "FACTURA_POR_FORMA" | "FACTURA_RECIBO" | "FACTURA";
      await issueAndDeliverOrderDocument(detail, {
        attendantLabel:
          sess?.user?.name?.trim() || sess?.user?.email?.trim() || undefined,
        documentModel,
      });
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : documentUsesDownloadDelivery(documentModel)
            ? "Não foi possível descarregar o PDF."
            : "Não foi possível gerar o comprovante para impressão.",
      );
    } finally {
      listReceiptLockRef.current = false;
      setListReceiptPrintingId(null);
    }
  }, []);

  const visible = orders.filter((o) => {
    if (filter && o.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.orderNumber.toLowerCase().includes(q) && !o.client.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const submittedCount = orders.filter((o) => o.status === "SUBMITTED").length;

  const kpi = useMemo(() => {
    const needsPrice = orders.filter(
      (o) => orderAmount(o) <= 0 && o.status !== "CANCELLED",
    ).length;
    const unreadOrders = orders.filter((o) => (unreadMap[o.id] ?? 0) > 0).length;
    const totalUnreadMsgs = orders.reduce(
      (s, o) => s + (unreadMap[o.id] ?? 0),
      0,
    );
    return { needsPrice, unreadOrders, totalUnreadMsgs };
  }, [orders, unreadMap]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      m[o.status] = (m[o.status] ?? 0) + 1;
    }
    return m;
  }, [orders]);

  const listFiltered = Boolean(filter || search.trim());

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      {/* Cabeçalho + hero leve */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/90 via-zinc-900/55 to-amber-950/25 px-5 py-7 sm:px-8 sm:py-8 ring-1 ring-white/[0.04]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/85">
              Operação
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {hidePaymentAndMoney ? "Pedidos" : "Pedidos & faturamento"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              {hidePaymentAndMoney ? (
                <>
                  {orders.length} pedido{orders.length !== 1 ? "s" : ""} na vista
                  operacional (sem dados de pagamento ou valores).
                  {listFiltered ? (
                    <span className="text-zinc-500">
                      {" "}
                      · A mostrar{" "}
                      <span className="font-semibold text-zinc-300">
                        {visible.length}
                      </span>{" "}
                      com os filtros actuais
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  {orders.length} pedido{orders.length !== 1 ? "s" : ""} carregado
                  {orders.length !== 1 ? "s" : ""}
                  {listFiltered ? (
                    <span className="text-zinc-500">
                      {" "}
                      · A mostrar{" "}
                      <span className="font-semibold text-zinc-300">
                        {visible.length}
                      </span>{" "}
                      com os filtros actuais
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-amber-400/25 hover:bg-amber-500/10 hover:text-amber-100"
          >
            <svg
              className="mr-1.5 inline-block h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 16 16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M14 8A6 6 0 1 1 8 2" />
              <path d="M14 2v6h-6" />
            </svg>
            Atualizar lista
          </button>
        </div>

        {/* KPIs — designers não veem indicadores ligados a valores */}
        <div
          className={`relative mt-6 grid gap-3 sm:grid-cols-2 ${
            hidePaymentAndMoney ? "xl:grid-cols-3" : "xl:grid-cols-4"
          }`}
        >
          <PedidosKpiCard
            label="Submetidos"
            value={String(submittedCount)}
            hint="Aguardam triagem para designer"
            accent="from-amber-500/15 to-transparent"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          {!hidePaymentAndMoney ? (
            <PedidosKpiCard
              label="Sem valor definido"
              value={String(kpi.needsPrice)}
              hint="Total ≤ 0 e não cancelados"
              accent="from-orange-500/12 to-transparent"
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          ) : null}
          <PedidosKpiCard
            label="Mensagens por ler"
            value={
              kpi.unreadOrders > 0
                ? `${kpi.unreadOrders} pedido${kpi.unreadOrders !== 1 ? "s" : ""}`
                : "0"
            }
            hint={
              kpi.totalUnreadMsgs > 0
                ? `${kpi.totalUnreadMsgs} mensagem(ns) no total`
                : "Inbox limpa nesta amostra"
            }
            accent="from-sky-500/12 to-transparent"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
          <PedidosKpiCard
            label="Total na lista"
            value={String(orders.length)}
            hint="Limite de carregamento: 200"
            accent="from-zinc-500/10 to-transparent"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
        </div>

        {!loading && orders.length > 0 ? (
          <PedidosStatusMixBar counts={statusCounts} total={orders.length} />
        ) : null}
      </div>

      {/* Filtros + pesquisa */}
      <div className="mb-5 rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-4 ring-1 ring-white/[0.04]">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Pesquisa e filtros
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Filtra por fase (com contagens da amostra) ou localiza pelo nº do pedido ou cliente.
            </p>
          </div>
          {!loading && orders.length > 0 ? (
            <p className="text-[11px] tabular-nums text-zinc-500">
              <span className="font-semibold text-zinc-300">{visible.length}</span>
              {" · "}
              {listFiltered ? "resultado(s) com filtros" : "visíveis"} de{" "}
              <span className="text-zinc-400">{orders.length}</span> na amostra
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar nº ou cliente…"
            className="w-full rounded-xl border border-white/[0.08] bg-zinc-950/50 px-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 lg:max-w-xs"
            aria-label="Pesquisar pedidos"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              Por fase
            </span>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              {FILTER_OPTIONS.map((opt) => {
                const count =
                  opt.value === ""
                    ? orders.length
                    : (statusCounts[opt.value] ?? 0);
                return (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    onClick={() => setFilter(opt.value)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                      filter === opt.value
                        ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/35"
                        : "border border-white/[0.08] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span
                      className={`rounded-md px-1.5 py-px text-[10px] font-bold tabular-nums ${
                        filter === opt.value
                          ? "bg-amber-400/25 text-amber-200"
                          : "bg-white/[0.06] text-zinc-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <PedidosTableSkeleton />
      ) : visible.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.07] bg-zinc-900/25 px-6 py-12 text-center ring-1 ring-white/[0.04]">
          <svg
            className="h-10 w-10 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" />
            <path d="m19 10 3 3-3 3M22 13h-7" />
          </svg>
          <div>
            <p className="text-sm font-medium text-zinc-300">
              Nenhum pedido encontrado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Ajusta a pesquisa ou os filtros, ou recarrega a lista.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {listFiltered ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("");
                }}
                className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
              >
                Limpar filtros
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-amber-500/90 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Recarregar
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-zinc-900/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-zinc-950/40 px-4 py-2.5">
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold text-zinc-300">{visible.length}</span> linha
              {visible.length !== 1 ? "s" : ""}
              {listFiltered ? (
                <span className="text-zinc-600">
                  {" "}
                  (filtros activos · total na amostra {orders.length})
                </span>
              ) : null}
            </p>
            <p className="text-[10px] text-zinc-600">
              Clica numa linha para abrir o painel lateral
            </p>
          </div>
          <div className="max-h-[min(70vh,800px)] overflow-y-auto overscroll-y-contain">
            <table
              className={`w-full border-collapse text-sm ${
                hidePaymentAndMoney ? "min-w-[540px]" : "min-w-[720px]"
              }`}
            >
              <thead>
                <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-zinc-950/95 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Pedido
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Estado
                </th>
                {!hidePaymentAndMoney ? (
                  <>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Pagamento
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Total
                    </th>
                  </>
                ) : null}
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Criação
                </th>
                <th className="w-[88px] px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <span className="sr-only">
                    {hidePaymentAndMoney ? "Indicadores de linha" : "Imprimir comprovante"}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o, rowIdx) => {
                const unread = unreadMap[o.id] ?? 0;
                const isSelected = selected?.id === o.id;
                const dateParts = formatPedidoListDateParts(o.createdAt);
                return (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className={`border-b border-white/[0.05] transition-colors last:border-b-0 ${
                      rowIdx % 2 === 1 ? "bg-black/[0.12]" : ""
                    } ${rowSurfaceClass(o, unread, isSelected, hidePaymentAndMoney)}`}
                    title={`${o.orderNumber} — ${orderStatusLabel(o.status)}`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        {!hidePaymentAndMoney && o.paymentProofKey ? (
                          <span
                            className="mt-0.5 shrink-0 text-emerald-400/90"
                            title="Comprovativo de pagamento anexado"
                            aria-hidden
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-9.652 9.702a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94a3 3 0 1 1 4.243 4.243L9.596 17.602m11.742-11.742 4.243 4.243" />
                            </svg>
                          </span>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {o.orderOrigin === "BALCAO" ? (
                            <span
                              className="shrink-0 rounded border border-teal-500/35 bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-200"
                              title="Pedido registado no balcão (PDV)"
                            >
                              Balcão
                            </span>
                          ) : null}
                          <span className="font-mono text-xs font-semibold text-amber-400/90">
                            {o.orderNumber}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200">{o.client.name}</p>
                      <p className="text-[11px] text-zinc-600">{o.client.email}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusColor(o.status)}`}
                      >
                        {orderStatusLabel(o.status)}
                      </span>
                      <div className="mt-2 opacity-95">
                        <OrderPhaseStrip
                          status={o.status}
                          compact
                          balcaoInsumosOnly={isBalcaoInstantInsumosOrder(o)}
                        />
                      </div>
                    </td>
                    {!hidePaymentAndMoney ? (
                      <>
                        <td className="px-4 py-3 text-[11px] text-zinc-500">
                          {o.paymentMethod ? (
                            PAYMENT_METHOD_LABELS[
                              o.paymentMethod as PaymentMethodValue
                            ] ?? o.paymentMethod
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {orderAmount(o) > 0 ? (
                            <span className="font-semibold text-amber-300">
                              {formatMoney(o.totalAmount, o.currency)}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-zinc-500">
                              —
                            </span>
                          )}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-3 text-[11px] leading-tight text-zinc-500">
                      <span className="block font-medium text-zinc-400">
                        {dateParts.day}
                      </span>
                      <span className="block tabular-nums text-zinc-600">
                        {dateParts.time}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right align-top">
                      <div className="flex items-start justify-end gap-1">
                        {!hidePaymentAndMoney ? (
                          <button
                            type="button"
                            onClick={(ev) => void handleListReceiptPrint(ev, o)}
                            disabled={listReceiptPrintingId !== null}
                            title="Emitir documento PDF (modelo sugerido conforme o pedido)"
                            aria-label={`Imprimir comprovante ${o.orderNumber}`}
                            className="shrink-0 rounded-lg border border-white/[0.09] bg-white/[0.04] p-1.5 text-zinc-500 transition hover:border-amber-400/35 hover:bg-amber-400/12 hover:text-amber-200 disabled:pointer-events-none disabled:opacity-[0.28]"
                          >
                            {listReceiptPrintingId === o.id ? (
                              <span
                                className="inline-flex h-[18px] w-[18px] items-center justify-center"
                                aria-hidden
                              >
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-amber-400/35 border-t-amber-400" />
                              </span>
                            ) : (
                              <svg
                                className="h-[18px] w-[18px]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
                              </svg>
                            )}
                          </button>
                        ) : null}
                        <div className="flex items-center gap-2 pt-[3px]">
                        {unread > 0 ? (
                          <span
                            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-zinc-950"
                            title="Mensagens por ler"
                          >
                            {unread}
                          </span>
                        ) : null}
                        <svg
                          className="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-amber-400/75"
                          fill="none"
                          viewBox="0 0 16 16"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M6 12l4-4-4-4" />
                        </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Painel de detalhe */}
      {selected && (
        <OrderDetailPanel
          order={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          hidePaymentAndMoney={hidePaymentAndMoney}
        />
      )}
    </div>
  );
}
