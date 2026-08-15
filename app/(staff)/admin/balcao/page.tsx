"use client";

import { BalcaoOperationsPanel } from "@/components/admin/balcao/BalcaoOperationsPanel";
import { BalcaoArtigosTabs } from "@/components/admin/balcao/BalcaoArtigosTabs";
import {
  BalcaoClienteHiddenFields,
  BalcaoClienteSection,
} from "@/components/admin/balcao/BalcaoClienteSection";
import {
  BalcaoInsumosSection,
  type BalcaoInsumoRow,
} from "@/components/admin/balcao/BalcaoInsumosSection";
import { BalcaoStickyFooter } from "@/components/admin/balcao/BalcaoStickyFooter";
import { usePedidoArtigos } from "@/components/pedidos/usePedidoArtigos";
import { usePedidoAreaArtigos } from "@/components/pedidos/usePedidoAreaArtigos";
import { usePedidoGenericArtigos } from "@/components/pedidos/usePedidoGenericArtigos";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createCounterOrder,
  deleteOrder,
  getFinancePdvSessionCurrent,
  getOrder,
  listCatalogProducts,
  listCounterDraftOrders,
  listCounterInsumos,
  openFinancePdvSession,
  PAYMENT_METHOD_LABELS,
  registerCounterQuickClient,
  replaceCounterOrderItems,
  searchCounterClients,
  shareBalcaoDraftWithDesignTeam,
  submitOrder,
  type CatalogProduct,
  type CounterClientHit,
  type CounterDraftSummary,
  type CounterInsumoListItem,
  type CreateCounterOrderLine,
  type OrderDetail,
  type PaymentMethodValue,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { formatMoney } from "@/lib/format-money";
import {
  areaCatalogSyncActive,
  buildItemsFromAreaLines,
  estimateAreaSubtotal,
} from "@/lib/area-pricing-catalog";
import {
  buildItemsFromGenericLines,
  estimateGenericSubtotal,
  genericCatalogSyncActive,
} from "@/lib/pedido-generic-lines";
import {
  buildItemsFromPedidoArtigos,
  estimateArtigosSubtotal,
  isCatalogSyncActive,
} from "@/lib/pedido-artigos-lines";
import { randomClientId } from "@/lib/random-id";
import {
  MONEY_DECIMAL_PLACES,
  sanitizeUnsignedDecimalString,
  sanitizeUnsignedIntString,
} from "@/lib/numeric-input";
import { BalcaoSubmitSuccessToast } from "@/components/admin/BalcaoSubmitSuccessToast";
import { useAnimatedConfirm } from "@/components/providers/AnimatedConfirmProvider";
import type { PaymentReceiptPdfPayload } from "@/lib/payment-receipt-pdf";
import { issueAndDeliverOrderDocument } from "@/lib/order-document-flow";
import { InvoiceDocumentPicker } from "@/components/documents/InvoiceDocumentPicker";
import { invoiceDocumentContextFromOrder } from "@/lib/invoice-document-policy";
import { useInvoiceDocumentModel } from "@/lib/use-invoice-document-model";
import { ROUTES, contaPedidoModelagemPath } from "@/lib/routes";
import {
  angolaPhoneApiDigits,
  displayPhoneAsMask,
  formatWhatsAppMaskInput,
  isAngolaPhoneComplete,
} from "@/lib/whatsapp-mask";
import {
  dadivaFileInputBase,
  dadivaInput,
  dadivaInputReadonly,
  dadivaLabel,
  dadivaLabelCompact,
  dadivaSurfaceCard,
} from "@/lib/dadiva-ui-classes";

const proofFileInputClass = `mt-2 ${dadivaFileInputBase}`;
const BALCAO_SUBMIT_METHODS: PaymentMethodValue[] = [
  "PDV_CASH",
  "PDV_DEBIT_CARD",
  "BANK_TRANSFER_SAME",
  "DEPOSIT",
  "BANK_TRANSFER_EXPRESS",
];

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function paymentMethodRequiresProof(
  pm: PaymentMethodValue | null | undefined,
): boolean {
  return (
    pm === "BANK_TRANSFER_SAME" ||
    pm === "DEPOSIT" ||
    pm === "BANK_TRANSFER_EXPRESS"
  );
}

function parseMoneyInput(raw: string): number {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

/** Valor para o input (sem sufixo Kz), alinhado ao total a pagar. */
function formatAmountForInput(n: number): string {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function orderMoneyValue(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string")
    return parseFloat(v.replace(",", ".")) || 0;
  return Number(v) || 0;
}

/** Preço unitário para linha de balcão: `precoVenda` se > 0, senão `custoUnit`. */
function balcaoInsumoSellingUnit(it: CounterInsumoListItem | undefined): number {
  if (!it) return Number.NaN;
  const pv = orderMoneyValue(it.precoVenda);
  if (Number.isFinite(pv) && pv > 0) return pv;
  return orderMoneyValue(it.custoUnit);
}

/** Subtotal das linhas no rascunho (antes do desconto na submissão). */
function balcaoGrossFromOrder(order: OrderDetail | null): number {
  if (!order) return 0;
  if (order.items?.length) {
    let s = 0;
    for (const it of order.items) {
      s += orderMoneyValue(it.unitPrice) * (it.quantity ?? 0);
    }
    return Math.round(s * 100) / 100;
  }
  return orderMoneyValue(order.totalAmount);
}

/** Verdadeiro se o pedido tiver peça têxtil / impressão (não só retalho de stock). */
function orderNeedsTextileModelagem(
  order: Pick<OrderDetail, "items"> | null | undefined,
): boolean {
  if (!order?.items?.length) return false;
  return order.items.some((it) => it.productionProcess !== "STORE_RETAIL");
}

function discountCappedToGross(gross: number, discountRaw: string): number {
  const raw = parseMoneyInput(discountRaw);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, gross);
}

function discountExceedsGross(gross: number, discountRaw: string): boolean {
  const raw = parseMoneyInput(discountRaw);
  if (!Number.isFinite(raw) || raw <= 0) return false;
  return raw > gross + 1e-9;
}

type BalcaoInsumoRowLocal = BalcaoInsumoRow;

function emptyBalcaoInsumoRow(): BalcaoInsumoRowLocal {
  return { id: randomClientId(), insumoId: "", qty: "" };
}

function parsePositiveIntQty(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Linhas preenchidas para `createCounterOrder`; ignora linhas vazias. */
function buildInsumoCounterLines(
  rows: BalcaoInsumoRow[],
  insumoList: CounterInsumoListItem[],
):
  | { ok: true; items: CreateCounterOrderLine[] }
  | { ok: false; message: string } {
  const byId = new Map(insumoList.map((i) => [i.id, i]));
  const items: CreateCounterOrderLine[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]!;
    const q = parsePositiveIntQty(r.qty);
    const id = r.insumoId.trim();
    if (!id && q === 0) continue;

    if (!id) {
      return {
        ok: false,
        message: `Material / insumo (linha ${idx + 1}): escolhe o produto em stock.`,
      };
    }
    if (!byId.has(id)) {
      return {
        ok: false,
        message: `Material / insumo (linha ${idx + 1}): produto inválido ou desactualizado. Recarrega a lista.`,
      };
    }
    if (q < 1) {
      return {
        ok: false,
        message: `Material / insumo (linha ${idx + 1}): indica quantidade inteira (≥ 1).`,
      };
    }
    const insumo = byId.get(id)!;
    const p = balcaoInsumoSellingUnit(insumo);
    if (!Number.isFinite(p) || p <= 0) {
      return {
        ok: false,
        message: `Material / insumo (linha ${idx + 1}): defina preço de venda ou custo unitário no cadastro do insumo «${insumo.nome}».`,
      };
    }
    items.push({ insumoId: id, quantity: q, unitPrice: p });
  }

  return { ok: true, items };
}

function estimateInsumoSubtotal(
  rows: BalcaoInsumoRow[],
  insumoList: CounterInsumoListItem[],
): number {
  const parsed = buildInsumoCounterLines(rows, insumoList);
  if (!parsed.ok) return 0;
  let s = 0;
  for (const it of parsed.items) {
    const p = it.unitPrice ?? 0;
    s += p * it.quantity;
  }
  return Math.round(s * 100) / 100;
}

function IconPedidoCliente({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconPagamentoChip({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 7a3 3 0 013-3h12v16H7a3 3 0 01-3-3V7zm15-1H7a2 2 0 00-2 2v9a2 2 0 002 2h12V6zM9 17h8v2H9v-2zm-3-8h14v6H6V9z" />
    </svg>
  );
}

function IconModelagemChip({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function BalcaoStepConnector({
  highlight,
  filled,
}: {
  highlight: boolean;
  filled: boolean;
}) {
  return (
    <div
      className={`flex w-3 shrink-0 items-center justify-center self-center sm:w-7 ${
        highlight ? "opacity-100" : "opacity-80"
      }`}
      aria-hidden
    >
      <div
        className={`relative h-1.5 w-full overflow-hidden rounded-full shadow-inner sm:h-2 ${
          highlight
            ? "shadow-[0_0_14px_-4px_rgba(251,191,36,0.45)] ring-2 ring-amber-300/40 dark:ring-amber-400/30"
            : "ring-0"
        }`}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-zinc-200 via-zinc-300 to-zinc-200 dark:from-zinc-600 dark:via-zinc-500 dark:to-zinc-600" />
        <div
          className={`absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-amber-300 shadow-[0_0_16px_-2px_rgba(251,191,36,0.75)] ring-1 ring-white/50 transition-transform duration-700 ease-out dark:from-emerald-500 dark:via-amber-400 dark:to-amber-500 dark:ring-amber-200/25 ${
            filled ? "scale-x-100" : "scale-x-0"
          }`}
        />
      </div>
    </div>
  );
}

function BalcaoStepper({ step }: { step: 1 | 2 | 3 }) {
  const pill1Ref = useRef<HTMLDivElement>(null);
  const pill2Ref = useRef<HTMLDivElement>(null);
  const pill3Ref = useRef<HTMLDivElement>(null);
  const s1a = step === 1;
  const s1d = step > 1;
  const s2a = step === 2;
  const s2d = step > 2;
  const s3a = step === 3;

  useLayoutEffect(() => {
    if (prefersReducedMotionClient()) return;
    const el =
      step === 1
        ? pill1Ref.current
        : step === 2
          ? pill2Ref.current
          : pill3Ref.current;
    if (!el) return;
    let cancelled = false;
    let anim: { revert: () => void } | null = null;
    void import("animejs").then(({ animate }) => {
      if (cancelled || !el) return;
      anim = animate(el, {
        scale: [1, 1.05, 1],
        duration: 620,
        ease: "outCubic",
      });
    });
    return () => {
      cancelled = true;
      anim?.revert();
      el.style.scale = "";
    };
  }, [step]);

  return (
    <div
      className="relative flex w-full max-w-3xl flex-wrap items-stretch gap-y-2 gap-x-1 sm:gap-x-2"
      aria-label="Progresso do pedido de balcão"
    >
      <div
        className="pointer-events-none absolute -inset-3 -z-10 rounded-2xl bg-gradient-to-br from-amber-400/12 via-transparent to-violet-500/10 blur-2xl opacity-90 dark:from-amber-500/14 dark:to-violet-600/14"
        aria-hidden
      />
      <div
        ref={pill1Ref}
        className={`relative flex min-w-[9.5rem] flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm transition-[transform,box-shadow,border-color] duration-300 sm:min-w-0 sm:gap-2.5 sm:px-3.5 sm:py-2.5 ${
          s1a
            ? "border-amber-400/65 bg-gradient-to-br from-amber-400/[0.26] via-amber-300/14 to-orange-400/18 text-zinc-900 shadow-[0_6px_28px_-8px_rgba(245,158,11,0.55)] ring-2 ring-amber-400/35 dark:border-amber-400/40 dark:text-white dark:shadow-[0_8px_32px_-10px_rgba(251,191,36,0.45)] dark:ring-amber-400/25"
            : s1d
              ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/14 via-emerald-400/10 to-teal-500/14 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-emerald-500/30 dark:border-emerald-400/35 dark:text-emerald-50 dark:from-emerald-500/22 dark:to-teal-600/14 dark:ring-emerald-400/25"
              : "border-zinc-200/90 bg-white/85 text-zinc-500 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400"
        }`}
      >
        {s1a ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_30%_-20%,rgba(255,255,255,0.45)_0%,transparent_55%)] opacity-70 dark:opacity-40"
          />
        ) : null}
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums shadow-inner transition-colors duration-300 sm:h-8 sm:w-8 sm:text-xs ${
            s1a
              ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-950 shadow-md shadow-amber-600/35 ring-2 ring-white/60 dark:from-amber-300 dark:to-amber-500 dark:text-black dark:ring-amber-200/35"
              : s1d
                ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-700/30 ring-2 ring-white/30"
                : "bg-zinc-200 text-zinc-500 ring-1 ring-zinc-300/80 dark:bg-zinc-700 dark:text-zinc-400 dark:ring-zinc-500/50"
          }`}
        >
          {s1d ? (
            <IconCheckBold className="h-4 w-4 stroke-[3] sm:h-[1.125rem] sm:w-[1.125rem]" />
          ) : (
            "1"
          )}
        </span>
        <span className="relative flex min-w-0 items-center gap-1.5 truncate text-[11px] font-bold leading-tight tracking-tight sm:text-xs">
          <IconPedidoCliente
            className={`h-3.5 w-3.5 shrink-0 opacity-80 sm:h-4 sm:w-4 ${
              s1a
                ? "text-amber-800 dark:text-amber-100"
                : s1d
                  ? "text-emerald-900 dark:text-emerald-50"
                  : "text-zinc-400"
            }`}
          />
          Cliente e artigos
        </span>
      </div>

      <BalcaoStepConnector highlight={s2a || s3a} filled={s1d} />

      <div
        ref={pill2Ref}
        title="Modelagem 2D — igual ao fluxo do cliente"
        className={`relative flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm transition-[transform,box-shadow,border-color] duration-300 sm:min-w-0 sm:gap-2.5 sm:px-3.5 sm:py-2.5 ${
          s2a
            ? "border-amber-400/65 bg-gradient-to-br from-amber-400/[0.26] via-amber-300/14 to-orange-400/18 text-zinc-900 shadow-[0_6px_28px_-8px_rgba(245,158,11,0.55)] ring-2 ring-amber-400/35 dark:border-amber-400/40 dark:text-white dark:shadow-[0_8px_32px_-10px_rgba(251,191,36,0.45)] dark:ring-amber-400/25"
            : s2d
              ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/14 via-emerald-400/10 to-teal-500/14 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-emerald-500/30 dark:border-emerald-400/35 dark:text-emerald-50 dark:from-emerald-500/22 dark:to-teal-600/14 dark:ring-emerald-400/25"
              : "border-zinc-200/90 bg-white/85 text-zinc-500 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/55 dark:text-zinc-500"
        }`}
      >
        {s2a ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.45)_0%,transparent_55%)] opacity-70 dark:opacity-40"
          />
        ) : null}
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums shadow-inner transition-colors duration-300 sm:h-8 sm:w-8 sm:text-xs ${
            s2a
              ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-950 shadow-md shadow-amber-600/35 ring-2 ring-white/60 dark:from-amber-300 dark:to-amber-500 dark:text-black dark:ring-amber-200/35"
              : s2d
                ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-700/30 ring-2 ring-white/30"
                : "bg-zinc-200 text-zinc-500 ring-1 ring-zinc-300/80 dark:bg-zinc-700 dark:text-zinc-400 dark:ring-zinc-500/50"
          }`}
        >
          {s2d ? (
            <IconCheckBold className="h-4 w-4 stroke-[3] sm:h-[1.125rem] sm:w-[1.125rem]" />
          ) : (
            "2"
          )}
        </span>
        <span className="relative flex min-w-0 items-center gap-1.5 truncate text-[11px] font-bold leading-tight tracking-tight sm:text-xs">
          <IconModelagemChip
            className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
              s2a
                ? "text-amber-800 dark:text-amber-50"
                : s2d
                  ? "text-emerald-900 dark:text-emerald-50"
                  : "text-zinc-400 dark:text-zinc-500"
            }`}
          />
          Modelagem
        </span>
      </div>

      <BalcaoStepConnector highlight={s3a} filled={s2d} />

      <div
        ref={pill3Ref}
        className={`relative flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm transition-[transform,box-shadow,border-color] duration-300 sm:min-w-0 sm:gap-2.5 sm:px-3.5 sm:py-2.5 ${
          s3a
            ? "border-amber-400/65 bg-gradient-to-br from-amber-400/[0.26] via-amber-300/14 to-orange-400/18 text-zinc-900 shadow-[0_6px_28px_-8px_rgba(245,158,11,0.55)] ring-2 ring-amber-400/35 dark:border-amber-400/40 dark:text-white dark:shadow-[0_8px_32px_-10px_rgba(251,191,36,0.45)] dark:ring-amber-400/25"
            : "border-zinc-200/90 bg-white/85 text-zinc-500 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/55 dark:text-zinc-500"
        }`}
      >
        {s3a ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_70%_-20%,rgba(255,255,255,0.45)_0%,transparent_55%)] opacity-70 dark:opacity-40"
          />
        ) : null}
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums shadow-inner transition-colors duration-300 sm:h-8 sm:w-8 sm:text-xs ${
            s3a
              ? "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-950 shadow-md shadow-amber-600/35 ring-2 ring-white/60 dark:from-amber-300 dark:to-amber-500 dark:text-black dark:ring-amber-200/35"
              : "bg-zinc-200 text-zinc-500 ring-1 ring-zinc-300/80 dark:bg-zinc-700 dark:text-zinc-400 dark:ring-zinc-500/50"
          }`}
        >
          3
        </span>
        <span className="relative flex min-w-0 items-center gap-1.5 truncate text-[11px] font-bold leading-tight tracking-tight sm:text-xs">
          <IconPagamentoChip
            className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
              s3a
                ? "text-amber-800 dark:text-amber-50"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          />
          Pagamento
        </span>
      </div>
    </div>
  );
}

function prefersReducedMotionClient(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function IconCheckBold({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminPedidoBalcaoPage() {
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [insumosBalcao, setInsumosBalcao] = useState<CounterInsumoListItem[]>(
    [],
  );
  const [insumosBalcaoErr, setInsumosBalcaoErr] = useState<string | null>(null);

  const [clientQuery, setClientQuery] = useState("");
  const [clientHits, setClientHits] = useState<CounterClientHit[]>([]);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CounterClientHit | null>(
    null,
  );

  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickIsCompany, setQuickIsCompany] = useState(false);
  const [quickNif, setQuickNif] = useState("");
  const [quickRegDialogOpen, setQuickRegDialogOpen] = useState(false);
  const [quickRegDraft, setQuickRegDraft] = useState({
    name: "",
    phone: "",
    isCompany: false,
    nif: "",
  });
  const [quickRegDialogErr, setQuickRegDialogErr] = useState<string | null>(
    null,
  );
  const [quickRegBusy, setQuickRegBusy] = useState(false);

  /** Evita saltar para o topo quando o modal fecha (o foco volta ao botão «Registo rápido»). */
  const quickRegScrollYRef = useRef(0);
  const quickRegDialogWasOpenRef = useRef(false);

  const {
    lines: artigoLines,
    catalogSyncActive,
    grandTotalPieces,
    addLine,
    removeLine,
    patchLine,
    patchSizeQty,
    resetLines,
  } = usePedidoArtigos(catalog);

  const {
    lines: genericArtigoLines,
    genericSyncActive,
    grandTotalPieces: genericGrandTotal,
    addLine: addGenericLine,
    removeLine: removeGenericLine,
    patchLine: patchGenericLine,
    patchQty: patchGenericQty,
    resetLines: resetGenericLines,
  } = usePedidoGenericArtigos(catalog);

  const {
    lines: areaArtigoLines,
    areaSyncActive,
    activeLineCount: areaActiveLineCount,
    addLine: addAreaLine,
    removeLine: removeAreaLine,
    patchLine: patchAreaLine,
    patchDimension: patchAreaDimension,
    patchQty: patchAreaQty,
    resetLines: resetAreaLines,
  } = usePedidoAreaArtigos(catalog);

  const orderCatalogActive = useMemo(
    () =>
      isCatalogSyncActive(catalog) ||
      genericCatalogSyncActive(catalog) ||
      areaCatalogSyncActive(catalog),
    [catalog],
  );

  const [insumoRows, setInsumoRows] = useState<BalcaoInsumoRow[]>([]);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodValue>("PDV_CASH");
  const [draftOrder, setDraftOrder] = useState<OrderDetail | null>(null);
  /** Com rascunho: 2 = área de modelagem (peças têxteis); 3 = pagamento PDV. */
  const [pdvStep, setPdvStep] = useState<1 | 2 | 3>(1);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [receivedInput, setReceivedInput] = useState("");
  const [orderDescriptionInput, setOrderDescriptionInput] = useState("");
  const [receptionDateInput, setReceptionDateInput] = useState("");
  /** Se false, o valor recebido acompanha o total a pagar; alterações manuais passam a true. */
  const [receivedTouched, setReceivedTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  /** Qual acção do passo 1 está a correr (os dois botões partilham `busy`). */
  const [step1BusyAction, setStep1BusyAction] = useState<
    null | "continue" | "pause"
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [lastReceiptPayload, setLastReceiptPayload] =
    useState<PaymentReceiptPdfPayload | null>(null);
  const [reprintBusy, setReprintBusy] = useState(false);
  const [counterDrafts, setCounterDrafts] = useState<CounterDraftSummary[]>(
    [],
  );
  const [counterDraftsBusy, setCounterDraftsBusy] = useState(false);
  const [meRole, setMeRole] = useState<string | null>(null);
  /** `true` = turno de caixa aberto; `undefined` = ainda a verificar. */
  const [pdvCashSessionOpen, setPdvCashSessionOpen] = useState<
    boolean | undefined
  >(undefined);
  const [openCashDialogOpen, setOpenCashDialogOpen] = useState(false);
  const [openCashFloatInput, setOpenCashFloatInput] = useState("0");
  const [openCashDialogBusy, setOpenCashDialogBusy] = useState(false);
  const [openCashDialogErr, setOpenCashDialogErr] = useState<string | null>(
    null,
  );
  const [shareWithDesignBusy, setShareWithDesignBusy] = useState(false);
  const confirmAction = useAnimatedConfirm();

  const invoiceDocContext = useMemo(
    () =>
      invoiceDocumentContextFromOrder({
        status: draftOrder?.status ?? "DRAFT",
        paymentMethod,
        orderOrigin: "BALCAO",
      }),
    [draftOrder?.status, paymentMethod],
  );

  const {
    model: receiptDocumentModel,
    setModel: setReceiptDocumentModel,
    validation: receiptDocValidation,
    canIssue: canIssueReceiptDoc,
  } = useInvoiceDocumentModel(
    invoiceDocContext,
    draftOrder?.id ?? "balcao-checkout",
  );

  const dismissSuccessToast = useCallback(() => {
    setDoneId(null);
  }, []);

  const reprintLastReceipt = useCallback(async () => {
    if (!doneId || !lastReceiptPayload) return;
    setReprintBusy(true);
    try {
      const detail = await getOrder(doneId);
      const payload = await issueAndDeliverOrderDocument(detail, {
        documentModel: lastReceiptPayload.documentModel,
      });
      setLastReceiptPayload(payload);
    } catch {
      /* operador pode reimprimir em Pedidos */
    } finally {
      setReprintBusy(false);
    }
  }, [doneId, lastReceiptPayload]);

  useEffect(() => {
    if (
      draftOrder &&
      !orderNeedsTextileModelagem(draftOrder) &&
      pdvStep === 2
    ) {
      setPdvStep(3);
    }
  }, [draftOrder, pdvStep]);

  function patchInsumoRow(id: string, patch: Partial<BalcaoInsumoRow>) {
    setInsumoRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function onSelectInsumoProduct(rowId: string, insumoId: string) {
    patchInsumoRow(rowId, { insumoId });
  }

  function addBalcaoInsumoRow() {
    setInsumoRows((prev) => [...prev, emptyBalcaoInsumoRow()]);
  }

  function removeBalcaoInsumoRow(id: string) {
    setInsumoRows((prev) => prev.filter((r) => r.id !== id));
  }

  useEffect(() => {
    const role = loadSession()?.user?.role ?? null;
    setMeRole(role);
  }, []);

  const refreshPdvCashSession = useCallback(async () => {
    if (meRole !== "ADMIN" && meRole !== "ATTENDANT") {
      setPdvCashSessionOpen(undefined);
      return;
    }
    try {
      const s = await getFinancePdvSessionCurrent();
      setPdvCashSessionOpen(s != null);
    } catch {
      setPdvCashSessionOpen(false);
    }
  }, [meRole]);

  useEffect(() => {
    void refreshPdvCashSession();
  }, [refreshPdvCashSession]);

  useEffect(() => {
    if (pdvStep !== 3 || !draftOrder) return;
    setOrderDescriptionInput(draftOrder.notes?.trim() ?? "");
    setReceptionDateInput((prev) => {
      if (draftOrder.receptionDate) {
        const parsed = new Date(draftOrder.receptionDate);
        if (Number.isFinite(parsed.getTime())) {
          return toDatetimeLocalValue(parsed);
        }
      }
      return prev.trim() ? prev : toDatetimeLocalValue(new Date());
    });
  }, [pdvStep, draftOrder?.id, draftOrder?.notes, draftOrder?.receptionDate]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") void refreshPdvCashSession();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshPdvCashSession]);

  const cashTurnBlocking = useMemo(
    () =>
      (meRole === "ADMIN" || meRole === "ATTENDANT") &&
      pdvCashSessionOpen !== true,
    [meRole, pdvCashSessionOpen],
  );

  const closeOpenCashDialog = useCallback(() => {
    setOpenCashDialogOpen(false);
    setOpenCashDialogErr(null);
  }, []);

  const submitOpenCashSession = useCallback(async () => {
    setOpenCashDialogErr(null);
    setOpenCashDialogBusy(true);
    try {
      const raw = openCashFloatInput.replace(",", ".");
      const v = Number(raw);
      await openFinancePdvSession(Number.isFinite(v) ? v : 0);
      await refreshPdvCashSession();
      setOpenCashDialogOpen(false);
      setOpenCashDialogErr(null);
    } catch (e) {
      setOpenCashDialogErr(
        e instanceof Error ? e.message : "Erro ao abrir o turno de caixa.",
      );
    } finally {
      setOpenCashDialogBusy(false);
    }
  }, [openCashFloatInput, refreshPdvCashSession]);

  useEffect(() => {
    if (meRole !== "ADMIN" && meRole !== "ATTENDANT") return;
    let cancelled = false;
    void listCounterInsumos()
      .then((rows) => {
        if (!cancelled) {
          setInsumosBalcao(rows);
          setInsumosBalcaoErr(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInsumosBalcao([]);
          setInsumosBalcaoErr(
            "Não foi possível carregar a lista de produtos em stock para o balcão. Tente actualizar a página.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meRole]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listCatalogProducts();
        if (!cancelled) {
          setCatalog(rows);
          setCatalogErr(null);
        }
      } catch {
        if (!cancelled) {
          setCatalogErr("Não foi possível carregar o catálogo.");
          setCatalog([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setClientSearchBusy(true);
      void searchCounterClients(q)
        .then((rows) => {
          if (!cancelled) setClientHits(rows);
        })
        .catch(() => {
          if (!cancelled) setClientHits([]);
        })
        .finally(() => {
          if (!cancelled) setClientSearchBusy(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery]);

  const pickNewClientMode = useCallback((clearQuickFields?: boolean) => {
    setQuickRegDialogOpen(false);
    setQuickRegDialogErr(null);
    setSelectedClient(null);
    setClientQuery("");
    setClientHits([]);
    if (clearQuickFields) {
      setQuickName("");
      setQuickPhone("");
      setQuickIsCompany(false);
      setQuickNif("");
    }
  }, []);

  const openQuickRegDialog = useCallback(() => {
    setQuickRegDraft({
      name: quickName,
      phone: quickPhone,
      isCompany: quickIsCompany,
      nif: quickNif,
    });
    setQuickRegDialogErr(null);
    setQuickRegBusy(false);
    setQuickRegDialogOpen(true);
  }, [quickName, quickPhone, quickIsCompany, quickNif]);

  const closeQuickRegDialog = useCallback(() => {
    setQuickRegDialogOpen(false);
    setQuickRegDialogErr(null);
    setQuickRegBusy(false);
  }, []);

  const commitQuickRegDialog = useCallback(async () => {
    const name = quickRegDraft.name.trim();
    if (name.length < 2) {
      setQuickRegDialogErr(
        "Indica pelo menos o nome completo (2 ou mais caracteres).",
      );
      return;
    }
    const qp = quickRegDraft.phone.trim();
    if (qp && !isAngolaPhoneComplete(qp)) {
      setQuickRegDialogErr(
        "WhatsApp: indique 9 dígitos do número angolano (código +244 já está implícito no formato).",
      );
      return;
    }
    if (quickRegDraft.isCompany && !quickRegDraft.nif.trim()) {
      setQuickRegDialogErr("Indica o NIF da empresa.");
      return;
    }
    const phoneApi =
      qp && isAngolaPhoneComplete(quickRegDraft.phone)
        ? angolaPhoneApiDigits(quickRegDraft.phone)
        : undefined;

    setQuickRegBusy(true);
    setQuickRegDialogErr(null);
    try {
      const created = await registerCounterQuickClient({
        name,
        ...(phoneApi ? { phone: phoneApi } : {}),
        isCompany: quickRegDraft.isCompany,
        ...(quickRegDraft.isCompany
          ? { nif: quickRegDraft.nif.trim() }
          : {}),
      });
      setSelectedClient(created);
      setQuickName(created.name);
      setQuickPhone(displayPhoneAsMask(created.phone));
      setQuickIsCompany(created.clientType === "COMPANY");
      setQuickNif(created.nif ?? "");
      setClientQuery("");
      setClientHits([]);
      closeQuickRegDialog();
    } catch (e) {
      setQuickRegDialogErr(
        e instanceof Error ? e.message : "Erro ao guardar o cliente.",
      );
    } finally {
      setQuickRegBusy(false);
    }
  }, [quickRegDraft, closeQuickRegDialog]);

  useEffect(() => {
    if (quickRegDialogOpen) {
      quickRegScrollYRef.current =
        window.scrollY || document.documentElement.scrollTop || 0;
      quickRegDialogWasOpenRef.current = true;
    } else if (quickRegDialogWasOpenRef.current) {
      quickRegDialogWasOpenRef.current = false;
      const y = quickRegScrollYRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
        });
      });
    }
  }, [quickRegDialogOpen]);

  useEffect(() => {
    if (!quickRegDialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeQuickRegDialog();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickRegDialogOpen, closeQuickRegDialog]);

  useEffect(() => {
    if (!openCashDialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeOpenCashDialog();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCashDialogOpen, closeOpenCashDialog]);

  const refreshCounterDrafts = useCallback(async () => {
    setCounterDraftsBusy(true);
    try {
      setCounterDrafts(await listCounterDraftOrders());
    } catch {
      setCounterDrafts([]);
    } finally {
      setCounterDraftsBusy(false);
    }
  }, []);

  useEffect(() => {
    if (meRole === "ADMIN" || meRole === "ATTENDANT") {
      void refreshCounterDrafts();
    }
  }, [meRole, refreshCounterDrafts]);

  const router = useRouter();
  const searchParams = useSearchParams();

  /** Regresso da modelagem web (`?resume=<id>`): reabre o mesmo rascunho no passo 3 — pagamento. */
  useEffect(() => {
    const resumeId = searchParams.get("resume")?.trim();
    if (!resumeId) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      try {
        const order = await getOrder(resumeId);
        if (cancelled) return;
        if (order.status !== "DRAFT") {
          setErr("Este pedido já não está em rascunho.");
          return;
        }
        setDraftOrder(order);
        setPdvStep(3);
        setPaymentMethod("PDV_CASH");
        setProofFile(null);
        setReceivedTouched(false);
        setReceivedInput("");
        setDiscountInput("");
        void refreshCounterDrafts();
      } catch (e) {
        if (!cancelled) {
          setErr(
            e instanceof Error
              ? e.message
              : "Não foi possível abrir o rascunho para pagamento.",
          );
        }
      } finally {
        setBusy(false);
        if (!cancelled) {
          router.replace(ROUTES.admin.pedidoBalcao, { scroll: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router, refreshCounterDrafts]);

  const { total: estSubtotal, currency: estCurrency } = useMemo(
    () => estimateArtigosSubtotal(artigoLines, catalog),
    [artigoLines, catalog],
  );

  const estInsumoSubtotal = useMemo(
    () => estimateInsumoSubtotal(insumoRows, insumosBalcao),
    [insumoRows, insumosBalcao],
  );

  const estGenericSubtotal = useMemo(
    () => estimateGenericSubtotal(genericArtigoLines, catalog ?? []),
    [genericArtigoLines, catalog],
  );

  const estAreaSubtotal = useMemo(
    () => estimateAreaSubtotal(areaArtigoLines, catalog ?? []),
    [areaArtigoLines, catalog],
  );

  const insumoParsed = useMemo(
    () => buildInsumoCounterLines(insumoRows, insumosBalcao),
    [insumoRows, insumosBalcao],
  );

  const hasInsumoLines =
    insumoParsed.ok && insumoParsed.items.length > 0;

  const pedidoBalcaoCanAdvance = useMemo(() => {
    const hasApparelQty = grandTotalPieces >= 1;
    const hasGenericQty = genericGrandTotal >= 1;
    const hasAreaQty = areaActiveLineCount >= 1;
    const hasProductQty = hasApparelQty || hasGenericQty || hasAreaQty;
    return (
      insumoParsed.ok &&
      (hasProductQty || hasInsumoLines) &&
      (!hasApparelQty || catalogSyncActive) &&
      (!hasGenericQty || genericSyncActive) &&
      (!hasAreaQty || areaSyncActive)
    );
  }, [
    insumoParsed.ok,
    hasInsumoLines,
    grandTotalPieces,
    genericGrandTotal,
    areaActiveLineCount,
    catalogSyncActive,
    genericSyncActive,
    areaSyncActive,
  ]);

  const combinedEstimateSubtotal = useMemo(
    () =>
      Math.round(
        (estSubtotal + estGenericSubtotal + estAreaSubtotal + estInsumoSubtotal) *
          100,
      ) / 100,
    [estSubtotal, estGenericSubtotal, estAreaSubtotal, estInsumoSubtotal],
  );

  const balcaoClientLabel = useMemo(() => {
    if (selectedClient?.name?.trim()) return selectedClient.name.trim();
    if (quickName.trim().length >= 2) return quickName.trim();
    return null;
  }, [selectedClient, quickName]);

  const balcaoFooterSubtotals = useMemo(
    () => ({
      vestuario: estSubtotal,
      plano: estGenericSubtotal,
      lona: estAreaSubtotal,
      insumos: estInsumoSubtotal,
      total: combinedEstimateSubtotal,
      currency: estCurrency,
    }),
    [
      estSubtotal,
      estGenericSubtotal,
      estAreaSubtotal,
      estInsumoSubtotal,
      combinedEstimateSubtotal,
      estCurrency,
    ],
  );

  const insumoFilledRowCount = useMemo(
    () => insumoRows.filter((r) => r.insumoId.trim() || r.qty.trim()).length,
    [insumoRows],
  );

  const catalogUnavailableHint = useMemo(() => {
    if (catalogErr) return catalogErr;
    if (catalog !== null && !orderCatalogActive) {
      return "Não há variantes activas no catálogo. Não é possível avançar até existirem produtos e preços publicados.";
    }
    return null;
  }, [catalog, catalogErr, orderCatalogActive]);

  function validateCounterStep1(): boolean {
    const hasApparelQty = grandTotalPieces >= 1;
    const hasGenericQty = genericGrandTotal >= 1;
    const hasAreaQty = areaActiveLineCount >= 1;
    const parsedInsumos = buildInsumoCounterLines(insumoRows, insumosBalcao);
    if (!parsedInsumos.ok) {
      setErr(parsedInsumos.message);
      return false;
    }
    const hasInsumoQty = parsedInsumos.items.length > 0;
    if (!hasApparelQty && !hasGenericQty && !hasAreaQty && !hasInsumoQty) {
      setErr(
        "Indica artigos (vestuário, canecas / impressão, lona / vinil) ou adiciona pelo menos uma linha de material / insumo ao balcão.",
      );
      return false;
    }
    if (hasApparelQty && (!catalog?.length || !catalogSyncActive)) {
      setErr(
        catalogErr ??
          "O catálogo de vestuário não está disponível. Não é possível criar o pedido.",
      );
      return false;
    }
    if (hasGenericQty && (!catalog?.length || !genericSyncActive)) {
      setErr(
        "O catálogo de canecas / impressão plana não está disponível. Não é possível criar o pedido.",
      );
      return false;
    }
    if (hasAreaQty && (!catalog?.length || !areaSyncActive)) {
      setErr(
        "O catálogo de lona / vinil não está disponível. Não é possível criar o pedido.",
      );
      return false;
    }
    if (selectedClient) {
      setErr(null);
      return true;
    }
    if (quickName.trim().length < 2) {
      setErr("Selecciona um cliente ou preenche o registo rápido (nome obrigatório).");
      return false;
    }
    const qp = quickPhone.trim();
    if (qp && !isAngolaPhoneComplete(qp)) {
      setErr(
        "WhatsApp: indique 9 dígitos do número angolano (código +244 já está implícito no formato).",
      );
      return false;
    }
    if (quickIsCompany && !quickNif.trim()) {
      setErr("Indica o NIF da empresa ou desactiva a conta de empresa.");
      return false;
    }
    setErr(null);
    return true;
  }

  async function createDraftAndContinue() {
    setErr(null);
    setDoneId(null);
    setLastReceiptPayload(null);
    if (cashTurnBlocking) {
      setErr(
        "Abra o turno de caixa (página Caixa) antes de registar vendas ou pedidos no balcão.",
      );
      return;
    }
    if (!validateCounterStep1()) return;
    setStep1BusyAction("continue");
    setBusy(true);
    try {
      const cat = catalog ?? [];
      const parsedInsumos = buildInsumoCounterLines(insumoRows, insumosBalcao);
      if (!parsedInsumos.ok) {
        setErr(parsedInsumos.message);
        setBusy(false);
        setStep1BusyAction(null);
        return;
      }
      const apparelItems: CreateCounterOrderLine[] = [];
      if (grandTotalPieces >= 1) {
        const built = buildItemsFromPedidoArtigos(artigoLines, cat);
        if (!built.ok) {
          setErr(built.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...built.items);
      }
      if (genericGrandTotal >= 1) {
        const builtG = buildItemsFromGenericLines(genericArtigoLines, cat);
        if (!builtG.ok) {
          setErr(builtG.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...builtG.items);
      }
      if (areaActiveLineCount >= 1) {
        const builtA = buildItemsFromAreaLines(areaArtigoLines, cat);
        if (!builtA.ok) {
          setErr(builtA.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...builtA.items);
      }
      if (apparelItems.length === 0 && parsedInsumos.items.length === 0) {
        setErr("Adiciona artigos ou materiais ao pedido.");
        setBusy(false);
        setStep1BusyAction(null);
        return;
      }
      const items = [...apparelItems, ...parsedInsumos.items];
      const order = draftOrder
        ? await replaceCounterOrderItems(draftOrder.id, { items })
        : await createCounterOrder({
            ...(selectedClient
              ? { clientId: selectedClient.id }
              : {
                  quickClient: {
                    name: quickName.trim(),
                    phone:
                      quickPhone.trim() && isAngolaPhoneComplete(quickPhone)
                        ? angolaPhoneApiDigits(quickPhone)
                        : undefined,
                    isCompany: quickIsCompany,
                    ...(quickIsCompany ? { nif: quickNif.trim() } : {}),
                  },
                }),
            items,
          });

      setDraftOrder(order);
      setPdvStep(orderNeedsTextileModelagem(order) ? 2 : 3);
      setPaymentMethod("PDV_CASH");
      setProofFile(null);
      setReceivedTouched(false);
      setReceivedInput("");
      setDiscountInput("");
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : draftOrder
            ? "Erro ao actualizar artigos do rascunho."
            : "Erro ao criar rascunho.",
      );
    } finally {
      setBusy(false);
      setStep1BusyAction(null);
      void refreshCounterDrafts();
    }
  }

  function resetFormForNextCounterCustomer() {
    setDraftOrder(null);
    setPdvStep(1);
    setProofFile(null);
    pickNewClientMode(true);
    resetLines();
    resetGenericLines();
    resetAreaLines();
    setInsumoRows([]);
    setDiscountInput("");
    setReceivedTouched(false);
    setReceivedInput("");
    setPaymentMethod("PDV_CASH");
  }

  /** Grava o rascunho no servidor (passo 1) e limpa o ecrã para novo cliente à fila. */
  async function saveDraftPauseFromStep1() {
    setErr(null);
    setDoneId(null);
    setLastReceiptPayload(null);
    if (cashTurnBlocking) {
      setErr(
        "Abra o turno de caixa (página Caixa) antes de registar vendas ou pedidos no balcão.",
      );
      return;
    }
    if (!validateCounterStep1()) return;
    setStep1BusyAction("pause");
    setBusy(true);
    try {
      const cat = catalog ?? [];
      const parsedInsumos = buildInsumoCounterLines(insumoRows, insumosBalcao);
      if (!parsedInsumos.ok) {
        setErr(parsedInsumos.message);
        setBusy(false);
        setStep1BusyAction(null);
        return;
      }
      const apparelItems: CreateCounterOrderLine[] = [];
      if (grandTotalPieces >= 1) {
        const built = buildItemsFromPedidoArtigos(artigoLines, cat);
        if (!built.ok) {
          setErr(built.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...built.items);
      }
      if (genericGrandTotal >= 1) {
        const builtG = buildItemsFromGenericLines(genericArtigoLines, cat);
        if (!builtG.ok) {
          setErr(builtG.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...builtG.items);
      }
      if (areaActiveLineCount >= 1) {
        const builtA = buildItemsFromAreaLines(areaArtigoLines, cat);
        if (!builtA.ok) {
          setErr(builtA.message);
          setBusy(false);
          setStep1BusyAction(null);
          return;
        }
        apparelItems.push(...builtA.items);
      }
      if (apparelItems.length === 0 && parsedInsumos.items.length === 0) {
        setErr("Adiciona artigos ou materiais ao pedido.");
        setBusy(false);
        setStep1BusyAction(null);
        return;
      }
      const items = [...apparelItems, ...parsedInsumos.items];
      if (draftOrder) {
        await replaceCounterOrderItems(draftOrder.id, { items });
      } else {
        await createCounterOrder({
          ...(selectedClient
            ? { clientId: selectedClient.id }
            : {
                quickClient: {
                  name: quickName.trim(),
                  phone:
                    quickPhone.trim() && isAngolaPhoneComplete(quickPhone)
                      ? angolaPhoneApiDigits(quickPhone)
                      : undefined,
                  isCompany: quickIsCompany,
                  ...(quickIsCompany ? { nif: quickNif.trim() } : {}),
                },
              }),
          items,
        });
      }

      resetFormForNextCounterCustomer();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Erro ao guardar rascunho em pausa.",
      );
    } finally {
      setBusy(false);
      setStep1BusyAction(null);
      void refreshCounterDrafts();
    }
  }

  /** Rascunho já criado: deixa de pagamento e abre lugar para outro cliente. */
  function pauseFromStep2() {
    if (!draftOrder) return;
    setErr(null);
    resetFormForNextCounterCustomer();
    void refreshCounterDrafts();
  }

  async function resumeCounterDraftSummary(id: string) {
    if (draftOrder?.id === id) return;
    setErr(null);
    setBusy(true);
    try {
      const order = await getOrder(id);
      if (order.status !== "DRAFT") {
        setErr("Este pedido já não está em rascunho.");
        void refreshCounterDrafts();
        return;
      }
      setDraftOrder(order);
      setPdvStep(orderNeedsTextileModelagem(order) ? 2 : 3);
      setPaymentMethod("PDV_CASH");
      setProofFile(null);
      setReceivedTouched(false);
      setReceivedInput("");
      setDiscountInput("");
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Não foi possível retomar o rascunho.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function discardCounterDraftSummary(id: string) {
    setErr(null);
    setBusy(true);
    try {
      await deleteOrder(id);
      if (draftOrder?.id === id) {
        setDraftOrder(null);
        setPdvStep(1);
        setProofFile(null);
        setDiscountInput("");
        setReceivedTouched(false);
        setReceivedInput("");
      }
      void refreshCounterDrafts();
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Não foi possível eliminar o rascunho.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelDraftAndBack() {
    if (!draftOrder) return;
    setErr(null);
    setBusy(true);
    try {
      await deleteOrder(draftOrder.id);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Não foi possível anular o rascunho. Tenta na lista de pedidos.",
      );
      setBusy(false);
      return;
    }
    setDraftOrder(null);
    setPdvStep(1);
    setProofFile(null);
    setDiscountInput("");
    setReceivedTouched(false);
    setReceivedInput("");
    setBusy(false);
    void refreshCounterDrafts();
  }

  async function shareDraftWithDesignTeamFromPdv() {
    if (!draftOrder) return;
    setErr(null);
    setShareWithDesignBusy(true);
    try {
      const updated = await shareBalcaoDraftWithDesignTeam(draftOrder.id);
      setDraftOrder(updated);
      void refreshCounterDrafts();
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Não foi possível disponibilizar o rascunho à equipa de design.",
      );
    } finally {
      setShareWithDesignBusy(false);
    }
  }

  const draftGrossNum = useMemo(
    () => balcaoGrossFromOrder(draftOrder),
    [draftOrder],
  );

  const discountAppliedPayment = useMemo(
    () => discountCappedToGross(draftGrossNum, discountInput),
    [draftGrossNum, discountInput],
  );

  const netToPayNum = useMemo(
    () => Math.round((draftGrossNum - discountAppliedPayment) * 100) / 100,
    [draftGrossNum, discountAppliedPayment],
  );

  const discountOverGross = useMemo(
    () => discountExceedsGross(draftGrossNum, discountInput),
    [draftGrossNum, discountInput],
  );

  useEffect(() => {
    if (!draftOrder || paymentMethod !== "PDV_CASH") return;
    if (receivedTouched) return;
    setReceivedInput(formatAmountForInput(netToPayNum));
  }, [draftOrder, paymentMethod, netToPayNum, receivedTouched]);

  const trocoPreview = useMemo(() => {
    if (!draftOrder || paymentMethod !== "PDV_CASH") return null;
    const received = parseMoneyInput(receivedInput);
    if (!Number.isFinite(received) || received < netToPayNum - 1e-9)
      return null;
    return Math.round((received - netToPayNum) * 100) / 100;
  }, [draftOrder, paymentMethod, receivedInput, netToPayNum]);

  async function submitDraftOrder() {
    if (!draftOrder) return;
    setErr(null);
    if (cashTurnBlocking) {
      setErr(
        "Abra o turno de caixa (página Caixa) antes de submeter o pedido.",
      );
      return;
    }
    if (paymentMethodRequiresProof(paymentMethod) && !proofFile) {
      setErr("Anexa o comprovativo de pagamento (PNG, JPG ou PDF).");
      return;
    }
    if (!canIssueReceiptDoc) {
      setErr(
        receiptDocValidation.error ??
          "Modelo de documento inválido para este pagamento.",
      );
      return;
    }
    const gross = balcaoGrossFromOrder(draftOrder);
    if (discountExceedsGross(gross, discountInput)) {
      setErr("O desconto não pode ser superior ao subtotal das linhas.");
      return;
    }
    const disc = discountCappedToGross(gross, discountInput);
    const net = Math.round((gross - disc) * 100) / 100;
    if (paymentMethod === "PDV_CASH") {
      const received = parseMoneyInput(receivedInput);
      if (!Number.isFinite(received)) {
        setErr("Indica o valor recebido em numerário.");
        return;
      }
      if (received + 1e-9 < net) {
        setErr(
          "O valor recebido tem de ser igual ou superior ao total a pagar.",
        );
        return;
      }
    }
    const receivedCash =
      paymentMethod === "PDV_CASH" ? parseMoneyInput(receivedInput) : undefined;
    const changeAmount =
      paymentMethod === "PDV_CASH" &&
      receivedCash !== undefined &&
      Number.isFinite(receivedCash) &&
      receivedCash + 1e-9 >= net
        ? Math.round((receivedCash - net) * 100) / 100
        : undefined;

    setBusy(true);
    try {
      const submitted = await submitOrder(
        draftOrder.id,
        paymentMethod,
        proofFile ?? undefined,
        {
          discountAmount: disc > 0 ? disc : undefined,
          notes: orderDescriptionInput.trim() || undefined,
          receptionDate: receptionDateInput.trim()
            ? new Date(receptionDateInput).toISOString()
            : undefined,
        },
      );
      const sess = loadSession();
      const receiptPayload = await issueAndDeliverOrderDocument(submitted, {
        receivedCash:
          paymentMethod === "PDV_CASH" && Number.isFinite(receivedCash)
            ? receivedCash
            : undefined,
        change:
          changeAmount !== undefined && changeAmount > 0
            ? changeAmount
            : undefined,
        attendantLabel:
          sess?.user?.name?.trim() ||
          sess?.user?.email?.trim() ||
          undefined,
        documentModel: receiptDocumentModel,
      });
      setLastReceiptPayload(receiptPayload);
      setDoneId(submitted.id);
      setDraftOrder(null);
      setPdvStep(1);
      setProofFile(null);
      resetLines();
      pickNewClientMode(true);
      setPaymentMethod("PDV_CASH");
      setDiscountInput("");
      setOrderDescriptionInput("");
      setReceptionDateInput("");
      setReceivedTouched(false);
      setReceivedInput("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao submeter pedido.");
    } finally {
      setBusy(false);
      void refreshCounterDrafts();
    }
  }

  if (meRole && meRole !== "ADMIN" && meRole !== "ATTENDANT") {
    return (
      <div className="min-h-[50vh] px-4 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white px-6 py-14 text-center text-sm text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          Apenas administradores e atendentes podem usar o PDV.
        </div>
      </div>
    );
  }

  return (
    <div className={pdvStep === 1 ? "pb-36" : "pb-20"}>
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-5">
        <div className="relative mb-5 flex flex-col gap-4 overflow-hidden rounded-xl border border-amber-200/35 bg-gradient-to-br from-white via-amber-50/40 to-violet-50/25 px-4 py-4 shadow-[0_14px_40px_-20px_rgba(245,158,11,0.35)] dark:border-amber-500/25 dark:from-zinc-900 dark:via-amber-950/40 dark:to-violet-950/25 dark:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.55)] sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-6 sm:py-4">
          <span
            className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-amber-400/25 blur-[5rem] dark:bg-amber-500/22"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute -bottom-28 -left-32 h-44 w-44 rounded-full bg-violet-500/15 blur-[4.25rem] dark:bg-violet-500/22"
            aria-hidden
          />
          <div className="relative z-[1] min-w-0 sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:gap-6">
            <div className="min-w-0 shrink-0">
              <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                <span
                  className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_-1px_rgb(34,197,94)] motion-reduce:animate-none motion-reduce:opacity-95"
                  aria-hidden
                />
                <span>Ponto de venda</span>
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-black shadow-md shadow-amber-600/30">
                  PDV
                </span>
              </p>
              <h1 className="mt-1.5 bg-gradient-to-r from-zinc-900 via-zinc-800 to-amber-800 bg-clip-text text-[1.35rem] font-extrabold leading-tight tracking-tight text-transparent dark:from-white dark:via-white dark:to-amber-400 sm:text-3xl">
                Pedido de Balcão
              </h1>
            </div>
            <div className="relative z-[1] mt-4 min-w-0 sm:mt-0 sm:flex-1 sm:max-w-xl">
              <BalcaoStepper step={pdvStep} />
            </div>
          </div>
          <Link
            href={ROUTES.admin.pedidos}
            className="relative z-[1] inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_24px_-8px_rgba(245,158,11,0.75)] ring-2 ring-black/25 transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:from-amber-300 hover:to-amber-400 hover:shadow-[0_14px_28px_-8px_rgba(245,158,11,0.85)] hover:ring-black/35 active:translate-y-0 dark:from-amber-400 dark:to-amber-500 dark:text-black dark:ring-white/35 dark:hover:-translate-y-px dark:hover:to-amber-400 sm:self-center sm:py-3"
          >
            <svg
              className="h-4 w-4 opacity-85"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Ver todos os pedidos
          </Link>
        </div>

      {meRole === "ADMIN" || meRole === "ATTENDANT" ? (
        <BalcaoOperationsPanel
          pdvCashSessionOpen={pdvCashSessionOpen}
          onOpenCashDialog={() => {
            setOpenCashFloatInput("0");
            setOpenCashDialogErr(null);
            setOpenCashDialogOpen(true);
          }}
          counterDrafts={counterDrafts}
          counterDraftsBusy={counterDraftsBusy}
          onRefreshDrafts={() => void refreshCounterDrafts()}
          activeDraftId={draftOrder?.id ?? null}
          busy={busy}
          onResumeDraft={(id) => void resumeCounterDraftSummary(id)}
          confirmDiscard={(id) => {
            void (async () => {
              const ok = await confirmAction({
                title: "Eliminar rascunho",
                message: "Eliminar este rascunho permanentemente?",
                destructive: true,
                confirmLabel: "Eliminar",
                cancelLabel: "Cancelar",
              });
              if (!ok) return;
              void discardCounterDraftSummary(id);
            })();
          }}
        />
      ) : null}

      {doneId ? (
        <BalcaoSubmitSuccessToast
          key={doneId}
          receiptPayload={lastReceiptPayload}
          onDismiss={dismissSuccessToast}
          onReprint={() => void reprintLastReceipt()}
          reprintBusy={reprintBusy}
        />
      ) : null}

      {quickRegDialogOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Fechar formulário"
            onClick={closeQuickRegDialog}
          />
          <div
            className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] dark:border-zinc-600 dark:bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="balcao-quick-reg-title"
          >
            <div className="border-b border-zinc-200/80 bg-gradient-to-r from-amber-50/90 to-white px-4 py-3 dark:border-zinc-600 dark:from-amber-950/40 dark:to-zinc-900">
              <h2
                id="balcao-quick-reg-title"
                className="text-base font-extrabold text-zinc-900 dark:text-zinc-50"
              >
                Registo rápido do cliente
              </h2>
              <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                «Guardar» cria o cliente na base de dados de imediato; depois pode pesquisá-lo pelo nome,
                telefone ou NIF.
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              {quickRegDialogErr ? (
                <p
                  className="rounded-lg border border-red-200/80 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                  role="alert"
                >
                  {quickRegDialogErr}
                </p>
              ) : null}
              <div>
                <label className={dadivaLabelCompact} htmlFor="quick-reg-name">
                  {quickRegDraft.isCompany
                    ? "Nome da empresa *"
                    : "Nome completo *"}
                </label>
                <input
                  id="quick-reg-name"
                  autoComplete="name"
                  value={quickRegDraft.name}
                  onChange={(e) =>
                    setQuickRegDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  className={`${dadivaInput} !py-2`}
                />
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 dark:border-zinc-600 dark:bg-zinc-800/50">
                <span>
                  <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    Conta de empresa
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                    Activa para pessoa jurídica (NIF obrigatório).
                  </span>
                </span>
                <span className="relative inline-flex shrink-0">
                  <input
                    type="checkbox"
                    checked={quickRegDraft.isCompany}
                    onChange={(e) =>
                      setQuickRegDraft((d) => ({
                        ...d,
                        isCompany: e.target.checked,
                        nif: e.target.checked ? d.nif : "",
                      }))
                    }
                    disabled={quickRegBusy}
                    className="peer sr-only"
                  />
                  <span className="h-6 w-11 rounded-full bg-zinc-300 transition peer-checked:bg-amber-500 dark:bg-zinc-700" />
                  <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                </span>
              </label>
              {quickRegDraft.isCompany ? (
                <div>
                  <label
                    className={dadivaLabelCompact}
                    htmlFor="quick-reg-nif"
                  >
                    NIF da empresa *
                  </label>
                  <input
                    id="quick-reg-nif"
                    type="text"
                    inputMode="numeric"
                    value={quickRegDraft.nif}
                    onChange={(e) =>
                      setQuickRegDraft((d) => ({ ...d, nif: e.target.value }))
                    }
                    className={`${dadivaInput} !py-2`}
                    placeholder="Número de identificação fiscal"
                  />
                </div>
              ) : null}
              <div>
                <label
                  className={dadivaLabelCompact}
                  htmlFor="quick-reg-phone"
                >
                  WhatsApp (+244)
                </label>
                <input
                  id="quick-reg-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={quickRegDraft.phone}
                  onChange={(e) =>
                    setQuickRegDraft((d) => ({
                      ...d,
                      phone: formatWhatsAppMaskInput(e.target.value),
                    }))
                  }
                  placeholder="+244 9XX XXX XXX"
                  maxLength={18}
                  className={`${dadivaInput} !py-2`}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-zinc-600 dark:bg-zinc-950/50">
              <button
                type="button"
                disabled={quickRegBusy}
                onClick={closeQuickRegDialog}
                className="rounded-xl border border-zinc-300/90 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={quickRegBusy}
                onClick={() => void commitQuickRegDialog()}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-sm font-extrabold text-black shadow-md shadow-amber-600/25 ring-1 ring-black/10 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 dark:ring-white/20"
              >
                {quickRegBusy ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-8">
        {draftOrder && pdvStep === 2 ? (
          <section className={dadivaSurfaceCard}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md shadow-violet-600/35">
                Passo 2 · Modelagem
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                antes do pagamento
              </span>
            </div>
            <h2 className="mt-2 bg-gradient-to-r from-zinc-900 via-violet-800 to-amber-800 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-white dark:via-zinc-100 dark:to-amber-400 sm:text-xl">
              Área de modelagem 2D
            </h2>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-600 shadow-sm dark:border-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-400">
              <span className="h-1 w-1 animate-pulse rounded-full bg-violet-500 motion-reduce:animate-none" aria-hidden />
              Rascunho {draftOrder.orderNumber}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Segue a mesma lógica do pedido online: depois de definir cliente e artigos, prepara a arte no editor
              (mockup, frente/costas, texto e imagens). Quando estiveres pronto, avança para o passo 3 — pagamento.
            </p>
            {orderNeedsTextileModelagem(draftOrder) ? (
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.08] px-3.5 py-3.5 dark:border-emerald-500/30 dark:bg-emerald-950/35">
                {draftOrder.draftSharedWithDesignTeam ? (
                  <p className="text-sm font-semibold leading-relaxed text-emerald-950 dark:text-emerald-100">
                    Este rascunho está visível para a equipa de design: podem abrir o pedido na lista, reclamá-lo e
                    continuar a modelagem enquanto o pagamento no balcão fica para mais tarde.
                  </p>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      Para o designer preparar ou afinar a arte com calma, disponibiliza este rascunho. Fica na lista
                      criativa como pedido reclamável, com o mesmo editor de modelagem.
                    </p>
                    <button
                      type="button"
                      disabled={busy || shareWithDesignBusy}
                      onClick={() => void shareDraftWithDesignTeamFromPdv()}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/50 bg-gradient-to-b from-emerald-400/90 to-emerald-600/90 px-4 py-2.5 text-sm font-extrabold text-emerald-950 shadow-md shadow-emerald-900/20 transition hover:-translate-y-px disabled:opacity-45 sm:w-auto dark:border-emerald-400/40 dark:from-emerald-500/35 dark:to-emerald-700/50 dark:text-emerald-50"
                    >
                      {shareWithDesignBusy
                        ? "A disponibilizar…"
                        : "Disponibilizar à equipa de design"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setPdvStep(1)}
              className="mt-4 text-xs font-semibold text-amber-800 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
            >
              ← Voltar a cliente e artigos
            </button>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={contaPedidoModelagemPath(draftOrder.id)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-violet-500/50 bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-950 shadow-sm ring-1 ring-violet-400/25 transition hover:bg-violet-500/25 dark:text-violet-100 dark:hover:bg-violet-500/20 sm:min-w-[12rem]"
              >
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Abrir modelagem (mesmo fluxo do cliente)
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPdvStep(3)}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-extrabold text-black shadow-md shadow-amber-600/30 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-45 sm:min-w-[12rem]"
              >
                Continuar para pagamento
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">
              Podes voltar à modelagem no passo 3, antes de submeter.
            </p>
            <div className="mt-6 flex flex-col gap-3 border-t border-zinc-200/80 pt-5 dark:border-zinc-600 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelDraftAndBack()}
                className="rounded-xl border-2 border-zinc-300/90 bg-gradient-to-b from-white to-zinc-50 px-4 py-3 text-sm font-bold text-zinc-800 shadow-md transition hover:-translate-y-px hover:border-zinc-400 hover:shadow-lg disabled:opacity-45 dark:border-zinc-600 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500"
              >
                Voltar e anular rascunho
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={pauseFromStep2}
                className="rounded-xl border-2 border-sky-400/55 bg-gradient-to-b from-sky-50 to-white px-4 py-3 text-sm font-bold text-sky-950 shadow-md shadow-sky-500/15 transition hover:-translate-y-px hover:border-sky-500 hover:shadow-lg disabled:opacity-45 dark:border-sky-600/45 dark:from-sky-950/50 dark:to-zinc-900 dark:text-sky-100 dark:shadow-sky-950/30"
              >
                Pausar — atender outro
              </button>
            </div>
          </section>
        ) : null}
        {draftOrder && pdvStep === 3 ? (
          <section className={dadivaSurfaceCard}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black shadow-md shadow-amber-600/35">
                Passo 3 · Pagamento
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                quase a concluir
              </span>
            </div>
            <h2 className="mt-2 bg-gradient-to-r from-zinc-900 via-zinc-800 to-amber-800 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-white dark:via-zinc-100 dark:to-amber-400 sm:text-xl">
              Pagamento e submissão
            </h2>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-600 shadow-sm dark:border-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-400">
              <span className="h-1 w-1 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" aria-hidden />
              Rascunho {draftOrder.orderNumber}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPdvStep(1)}
              className="mt-3 text-xs font-semibold text-amber-800 underline decoration-amber-400/80 underline-offset-2 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
            >
              ← Voltar a cliente e artigos
            </button>
            {orderNeedsTextileModelagem(draftOrder) ? (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPdvStep(2)}
                  className="text-xs font-semibold text-violet-700 underline decoration-violet-400/80 underline-offset-2 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"
                >
                  ← Voltar à modelagem (ajustar arte)
                </button>
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.08] px-3.5 py-3.5 dark:border-emerald-500/30 dark:bg-emerald-950/35">
                  {draftOrder.draftSharedWithDesignTeam ? (
                    <p className="text-xs font-semibold leading-relaxed text-emerald-950 dark:text-emerald-100">
                      Rascunho disponível para a equipa de design (reclamar e editar antes do pagamento).
                    </p>
                  ) : (
                    <>
                      <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                        Ainda não partilhaste com design? Podes disponibilizar o rascunho para prepararem a arte
                        enquanto concluis o pagamento aqui.
                      </p>
                      <button
                        type="button"
                        disabled={busy || shareWithDesignBusy}
                        onClick={() => void shareDraftWithDesignTeamFromPdv()}
                        className="mt-2 inline-flex items-center justify-center rounded-lg border border-emerald-600/50 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-500/30 disabled:opacity-45 dark:border-emerald-400/40 dark:text-emerald-100"
                      >
                        {shareWithDesignBusy
                          ? "A disponibilizar…"
                          : "Disponibilizar à equipa de design"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700/90 dark:text-amber-400/90">
              Dados do documento
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={dadivaLabel} htmlFor="balcao-reception-date">
                  Data de recepção
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Aparece no bloco «Cliente» da factura-recibo.
                </p>
                <input
                  id="balcao-reception-date"
                  type="datetime-local"
                  value={receptionDateInput}
                  onChange={(e) => setReceptionDateInput(e.target.value)}
                  className={`${dadivaInput} mt-2 !py-2`}
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label
                  className={dadivaLabel}
                  htmlFor="balcao-order-description"
                >
                  Descrição do pedido
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Texto livre (ex.: evento, referência interna, detalhes da encomenda).
                </p>
                <textarea
                  id="balcao-order-description"
                  rows={3}
                  value={orderDescriptionInput}
                  onChange={(e) => setOrderDescriptionInput(e.target.value)}
                  placeholder="Opcional"
                  className={`${dadivaInput} mt-2 min-h-[4.5rem] resize-y !py-2`}
                />
              </div>
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700/90 dark:text-amber-400/90">
              Método de pagamento
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BALCAO_SUBMIT_METHODS.map((pm) => (
                <label
                  key={pm}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px sm:px-4 sm:py-2.5 sm:text-sm ${
                    paymentMethod === pm
                      ? "border-amber-500/60 bg-gradient-to-b from-amber-400/35 to-amber-500/22 text-zinc-900 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 dark:text-white dark:from-amber-500/35 dark:to-amber-600/20 dark:ring-amber-400/30"
                      : "border-zinc-200/90 bg-white/90 text-zinc-600 hover:border-amber-400/40 hover:shadow-md dark:border-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300 dark:hover:border-amber-500/35"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="balcao-pay"
                    checked={paymentMethod === pm}
                    onChange={() => {
                      setPaymentMethod(pm);
                      if (!paymentMethodRequiresProof(pm)) setProofFile(null);
                      if (pm !== "PDV_CASH") {
                        setReceivedInput("");
                        setReceivedTouched(false);
                      } else {
                        setReceivedTouched(false);
                      }
                    }}
                  />
                  {PAYMENT_METHOD_LABELS[pm]}
                </label>
              ))}
            </div>
            <div className="mt-5 min-w-0">
              <InvoiceDocumentPicker
                id="balcao-invoice-model"
                value={receiptDocumentModel}
                onChange={setReceiptDocumentModel}
                validation={receiptDocValidation}
                disabled={busy}
                selectClassName={`${dadivaInput} mt-2`}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={dadivaLabel}>Desconto (Kz)</label>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Opcional. Máx.: subtotal das linhas.
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={discountInput}
                  onChange={(e) =>
                    setDiscountInput(
                      sanitizeUnsignedDecimalString(
                        e.target.value,
                        MONEY_DECIMAL_PLACES,
                      ),
                    )
                  }
                  placeholder="0"
                  className={`${dadivaInput} mt-2`}
                />
                {discountInput.trim() !== "" &&
                !Number.isFinite(parseMoneyInput(discountInput)) ? (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    Valor inválido — usa apenas números (vírgula ou ponto).
                  </p>
                ) : discountOverGross ? (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    O desconto não pode ser superior ao subtotal das linhas (
                    {formatMoney(draftGrossNum, draftOrder?.currency ?? "AOA")}).
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <label
                  className={`${dadivaLabel} ${paymentMethod !== "PDV_CASH" ? "text-zinc-400 dark:text-zinc-600" : ""}`}
                >
                  Valor recebido (Kz)
                </label>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  {paymentMethod === "PDV_CASH"
                    ? "Pré-preenchido com o total a pagar; altera só se houver troco ou usa o botão para confirmar o valor exacto."
                    : "Activa com «Dinheiro (balcão)»."}
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={
                    paymentMethod === "PDV_CASH" ? "Ex.: 5000" : "—"
                  }
                  value={receivedInput}
                  onChange={(e) => {
                    setReceivedTouched(true);
                    setReceivedInput(
                      sanitizeUnsignedDecimalString(
                        e.target.value,
                        MONEY_DECIMAL_PLACES,
                      ),
                    );
                  }}
                  disabled={paymentMethod !== "PDV_CASH"}
                  className={`${dadivaInput} mt-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-50 dark:disabled:bg-zinc-800`}
                />
                {paymentMethod === "PDV_CASH" ? (
                  <button
                    type="button"
                    disabled={busy || netToPayNum <= 0}
                    onClick={() => {
                      setReceivedTouched(false);
                      setReceivedInput(formatAmountForInput(netToPayNum));
                    }}
                    className="mt-3 flex w-full items-stretch overflow-hidden rounded-xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-50/95 via-white to-zinc-50/80 text-left shadow-md shadow-amber-600/15 transition hover:border-amber-500/55 hover:shadow-lg disabled:pointer-events-none disabled:opacity-40 dark:border-amber-500/35 dark:from-amber-950/35 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-amber-950/40 dark:hover:border-amber-400/50"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-lg shadow-amber-600/40 ring-2 ring-white/50 dark:from-amber-400 dark:to-orange-500 dark:ring-amber-900/50"
                        aria-hidden
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.75}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                          Pagamento exacto
                        </p>
                        <p className="mt-0.5 truncate font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 sm:text-[17px]">
                          {formatMoney(netToPayNum, draftOrder.currency)}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
                          Sem troco · repõe o campo com o total a pagar
                        </p>
                      </div>
                      <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                        <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                          Aplicar
                        </span>
                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                          um toque →
                        </span>
                      </div>
                      <div
                        className="flex shrink-0 items-center justify-center rounded-lg bg-zinc-200/80 p-2 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300 sm:hidden"
                        aria-hidden
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>
                ) : null}
                {paymentMethod === "PDV_CASH" ? (
                  trocoPreview != null ? (
                    <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                      Troco:{" "}
                      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatMoney(trocoPreview, draftOrder.currency)}
                      </span>
                    </p>
                  ) : receivedInput.trim() !== "" ? (
                    <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                      Valor deve ser ≥ total a pagar para ver o troco.
                    </p>
                  ) : null
                ) : null}
              </div>
            </div>
            <div className="mt-3 space-y-2 rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-50/70 via-white to-violet-50/40 px-3.5 py-3.5 text-xs shadow-inner shadow-amber-900/5 dark:border-amber-500/20 dark:from-amber-950/35 dark:via-zinc-900 dark:to-violet-950/30 dark:shadow-none">
              {discountAppliedPayment > 0 ? (
                <div className="flex justify-between gap-3 text-rose-700 dark:text-rose-400">
                  <span>Desconto</span>
                  <span className="tabular-nums">
                    −{formatMoney(discountAppliedPayment, draftOrder.currency)}
                  </span>
                </div>
              ) : null}
              <div
                className={`grid grid-cols-2 gap-3 ${discountAppliedPayment > 0 ? "border-t border-zinc-200 pt-2 dark:border-zinc-600" : ""}`}
              >
                <div className="min-w-0">
                  <div className="text-zinc-500 dark:text-zinc-500">Total de itens</div>
                  <div className="mt-0.5 truncate tabular-nums text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {formatMoney(draftGrossNum, draftOrder.currency)}
                  </div>
                </div>
                <div className="min-w-0 border-l border-zinc-200 pl-3 dark:border-zinc-600 sm:pl-4">
                  <div className="text-zinc-500 dark:text-zinc-500">A pagar</div>
                  <div className="mt-0.5 truncate tabular-nums text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(netToPayNum, draftOrder.currency)}
                  </div>
                </div>
              </div>
            </div>
            {paymentMethodRequiresProof(paymentMethod) ? (
              <div className="mt-4">
                <label className={dadivaLabel}>
                  Comprovativo de pagamento *
                </label>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  PNG, JPG ou PDF (como no checkout online).
                </p>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                  onChange={(e) =>
                    setProofFile(e.target.files?.[0] ?? null)
                  }
                  className={proofFileInputClass}
                />
              </div>
            ) : null}
            <p className="mt-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              Formato do comprovante (A5, A4 preto/branco total, A4 com texto de marca em âmbar, ou térmico 80 mm): configurado pelo
              administrador em{" "}
              <Link
                href="/admin/configuracoes"
                className="font-medium text-amber-700 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-600 dark:text-amber-300"
              >
                Configurações
              </Link>
              .
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelDraftAndBack()}
                className="rounded-xl border-2 border-zinc-300/90 bg-gradient-to-b from-white to-zinc-50 px-4 py-3 text-sm font-bold text-zinc-800 shadow-md transition hover:-translate-y-px hover:border-zinc-400 hover:shadow-lg disabled:opacity-45 dark:border-zinc-600 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 sm:min-w-[10rem]"
              >
                Voltar e anular rascunho
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={pauseFromStep2}
                className="rounded-xl border-2 border-sky-400/55 bg-gradient-to-b from-sky-50 to-white px-4 py-3 text-sm font-bold text-sky-950 shadow-md shadow-sky-500/15 transition hover:-translate-y-px hover:border-sky-500 hover:shadow-lg disabled:opacity-45 dark:border-sky-600/45 dark:from-sky-950/50 dark:to-zinc-900 dark:text-sky-100 dark:shadow-sky-950/30 sm:min-w-[10rem]"
              >
                Pausar — atender outro
              </button>
              <button
                type="button"
                disabled={busy || cashTurnBlocking || discountOverGross}
                onClick={() => void submitDraftOrder()}
                className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-8 py-3.5 text-sm font-extrabold text-black shadow-[0_12px_34px_-10px_rgba(245,158,11,0.75)] ring-2 ring-black/20 transition hover:-translate-y-px hover:from-amber-300 hover:to-amber-400 hover:shadow-[0_14px_40px_-10px_rgba(245,158,11,0.85)] disabled:opacity-45 dark:ring-white/35 sm:min-w-[12rem]"
              >
                {busy ? "A submeter…" : "Submeter pedido"}
              </button>
            </div>
          </section>
        ) : null}
        {pdvStep === 1 ? (
          <>
            {draftOrder ? (
              <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-50/90 px-3.5 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100">
                A editar o rascunho{" "}
                <span className="font-mono font-bold">{draftOrder.orderNumber}</span>
                . Podes acrescentar ou alterar artigos; ao continuar, o pedido é
                actualizado (não cria um novo).
              </div>
            ) : null}
            <div className="space-y-4">
                <BalcaoClienteSection
                  selectedClient={selectedClient}
                  clientQuery={clientQuery}
                  clientHits={clientHits}
                  clientSearchBusy={clientSearchBusy}
                  onClientQueryChange={setClientQuery}
                  onSelectClient={(c) => {
                    setSelectedClient(c);
                    setClientHits([]);
                    setClientQuery("");
                    setQuickName(c.name ?? "");
                    setQuickPhone(displayPhoneAsMask(c.phone));
                    setQuickIsCompany(c.clientType === "COMPANY");
                    setQuickNif(c.nif ?? "");
                  }}
                  onClearClient={() => pickNewClientMode(true)}
                  onEditClient={() => pickNewClientMode(false)}
                  onQuickReg={openQuickRegDialog}
                />
                {!selectedClient && quickName.trim().length > 0 ? (
                  <BalcaoClienteHiddenFields
                    quickName={quickName}
                    quickPhone={quickPhone}
                    quickIsCompany={quickIsCompany}
                    quickNif={quickNif}
                    onNameChange={setQuickName}
                    onPhoneChange={(v) =>
                      setQuickPhone(formatWhatsAppMaskInput(v))
                    }
                    onIsCompanyChange={(v) => {
                      setQuickIsCompany(v);
                      if (!v) setQuickNif("");
                    }}
                    onNifChange={setQuickNif}
                    showManual
                  />
                ) : null}

                <BalcaoArtigosTabs
                  catalog={catalog}
                  catalogUnavailableHint={catalogUnavailableHint}
                  vestuario={{
                    lines: artigoLines,
                    catalogSyncActive,
                    grandTotalPieces,
                    addLine,
                    removeLine,
                    patchLine,
                    patchSizeQty,
                  }}
                  plano={{
                    lines: genericArtigoLines,
                    genericSyncActive,
                    grandTotalPieces: genericGrandTotal,
                    addLine: addGenericLine,
                    removeLine: removeGenericLine,
                    patchLine: patchGenericLine,
                    patchQty: patchGenericQty,
                  }}
                  lona={{
                    lines: areaArtigoLines,
                    areaSyncActive,
                    activeLineCount: areaActiveLineCount,
                    addLine: addAreaLine,
                    removeLine: removeAreaLine,
                    patchLine: patchAreaLine,
                    patchDimension: patchAreaDimension,
                    patchQty: patchAreaQty,
                  }}
                  insumoLineCount={insumoFilledRowCount}
                  stockSlot={
                    <BalcaoInsumosSection
                      embedded
                      rows={insumoRows}
                      insumos={insumosBalcao}
                      insumosErr={insumosBalcaoErr}
                      currency={estCurrency}
                      sellingUnit={balcaoInsumoSellingUnit}
                      onAddRow={addBalcaoInsumoRow}
                      onRemoveRow={removeBalcaoInsumoRow}
                      onSelectProduct={onSelectInsumoProduct}
                      onPatchQty={(rowId, qty) =>
                        patchInsumoRow(rowId, { qty })
                      }
                    />
                  }
                />
            </div>

            <BalcaoStickyFooter
              clientLabel={balcaoClientLabel}
              subtotals={balcaoFooterSubtotals}
              canAdvance={pedidoBalcaoCanAdvance}
              busy={busy}
              busyAction={step1BusyAction}
              cashTurnBlocking={cashTurnBlocking}
              editingExistingDraft={!!draftOrder}
              onReturnToPayment={
                draftOrder
                  ? () =>
                      setPdvStep(
                        orderNeedsTextileModelagem(draftOrder) ? 2 : 3,
                      )
                  : undefined
              }
              onContinue={() => void createDraftAndContinue()}
              onPause={() => void saveDraftPauseFromStep1()}
            />
          </>
        ) : null}

        {err ? (
          <div
            className="rounded-xl border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-100"
            role="alert"
          >
            {err}
          </div>
        ) : null}
      </div>
      </div>

      {openCashDialogOpen &&
      (meRole === "ADMIN" || meRole === "ATTENDANT") ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[3px] disabled:cursor-not-allowed"
            aria-label="Fechar"
            disabled={openCashDialogBusy}
            onClick={() => {
              if (openCashDialogBusy) return;
              closeOpenCashDialog();
            }}
          />
          <div
            className="relative z-[1] w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_28px_70px_-24px_rgba(0,0,0,0.55)] dark:border-zinc-600 dark:bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="balcao-open-cash-title"
          >
            <div className="border-b border-zinc-100 bg-gradient-to-br from-amber-50 to-white px-5 py-4 dark:border-zinc-700 dark:from-amber-950/50 dark:to-zinc-900">
              <h2
                id="balcao-open-cash-title"
                className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50"
              >
                Abrir turno de caixa
              </h2>
            </div>
            <div className="space-y-4 px-5 py-5">
              {openCashDialogErr ? (
                <p
                  className="rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-xs font-medium text-red-900 dark:border-red-900/45 dark:bg-red-950/45 dark:text-red-200"
                  role="alert"
                >
                  {openCashDialogErr}
                </p>
              ) : null}
              <div>
                <label
                  className={dadivaLabelCompact}
                  htmlFor="balcao-open-cash-float"
                >
                  Fundo de abertura
                </label>
                <input
                  id="balcao-open-cash-float"
                  inputMode="decimal"
                  autoComplete="off"
                  value={openCashFloatInput}
                  onChange={(e) =>
                    setOpenCashFloatInput(
                      sanitizeUnsignedDecimalString(
                        e.target.value,
                        MONEY_DECIMAL_PLACES,
                      ),
                    )
                  }
                  className={`${dadivaInput} !py-2.5 text-base font-semibold tabular-nums`}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/80 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950/55">
              <button
                type="button"
                onClick={closeOpenCashDialog}
                disabled={openCashDialogBusy}
                className="rounded-xl border border-zinc-300/90 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={openCashDialogBusy}
                onClick={() => void submitOpenCashSession()}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-sm font-extrabold text-black shadow-md shadow-amber-600/20 ring-2 ring-black/10 transition hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 dark:ring-white/15"
              >
                {openCashDialogBusy ? "A abrir…" : "Confirmar abertura"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
