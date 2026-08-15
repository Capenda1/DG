"use client";

import { OrderCreationWizard } from "@/components/order/OrderCreationWizard";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getClientCheckoutPaymentSettings,
  PAYMENT_METHOD_LABELS,
  type ClientCheckoutPaymentSettings,
  type OrderDetail,
  type PaymentMethodValue,
} from "@/lib/api-client";
import { formatMoney } from "@/lib/format-money";
import { orderLineMeta } from "@/lib/order-line-meta";
import {
  paymentMethodEnabledInCheckout,
  paymentMethodHasRequiredData,
  paymentMethodReadyForSubmit,
  paymentMethodSelectableInCheckout,
} from "@/lib/payment-checkout-methods";
import { contaPedidoArtigosPath, isStaffRole } from "@/lib/routes";
import { coerceFiniteNumber } from "@/lib/coerce-values";

const CASH_METHOD: PaymentMethodValue = "CASH_ON_SITE";
const LAST_METHOD_KEY = "dadiva-last-payment-method";

const PAYMENT_OPTIONS: {
  value: PaymentMethodValue;
  icon: string;
  short: string;
  hint: string;
}[] = [
  {
    value: "BANK_TRANSFER_SAME",
    icon: "🏦",
    short: "Transferência",
    hint: "Mesmo banco",
  },
  { value: "DEPOSIT", icon: "💳", short: "Depósito", hint: "Conta bancária" },
  {
    value: "BANK_TRANSFER_EXPRESS",
    icon: "⚡",
    short: "Express",
    hint: "Transferência rápida",
  },
  { value: "CASH_ON_SITE", icon: "💵", short: "Dinheiro", hint: "Na loja" },
];

const PROOF_ACCEPT = "image/png,image/jpeg,application/pdf";

type ModalPhase = "review" | "payment" | "success";

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function paymentRows(
  method: PaymentMethodValue,
  settings: ClientCheckoutPaymentSettings | null,
): { label: string; value: string }[] {
  if (!settings || method === CASH_METHOD) return [];
  if (!paymentMethodEnabledInCheckout(method, settings)) return [];
  if (method === "BANK_TRANSFER_SAME") {
    const s = settings.bankTransferSame;
    return [
      { label: "IBAN / Conta", value: s.accountNumber || "—" },
      { label: "Titular", value: s.accountName || "—" },
      { label: "Banco", value: s.bankName || "—" },
    ];
  }
  if (method === "DEPOSIT") {
    const s = settings.deposit;
    return [
      { label: "Nº de Conta", value: s.accountNumber || "—" },
      { label: "Banco", value: s.bankName || "—" },
    ];
  }
  if (method === "BANK_TRANSFER_EXPRESS") {
    const s = settings.bankTransferExpress;
    return [
      { label: "Nº Express", value: s.expressNumber || "—" },
      { label: "Operador", value: s.provider || "—" },
    ];
  }
  return [];
}

async function copyText(text: string): Promise<boolean> {
  if (!text || text === "—") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function PaymentDetails({
  method,
  settings,
  settingsLoaded,
}: {
  method: PaymentMethodValue;
  settings: ClientCheckoutPaymentSettings | null;
  settingsLoaded: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (method === CASH_METHOD) {
    return (
      <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/20 px-4 py-3 text-[11px] leading-relaxed text-zinc-400">
        Pagamento em dinheiro na loja — não precisas de transferência nem comprovativo
        online. A equipa confirmará o pagamento no balcão.
      </div>
    );
  }

  if (!paymentMethodEnabledInCheckout(method, settings)) {
    return (
      <div className="rounded-xl border border-zinc-700/40 bg-zinc-950/40 px-4 py-3 text-[11px] text-zinc-500">
        Este método está desactivado nas configurações da loja.
      </div>
    );
  }

  if (!settingsLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-700/30 bg-zinc-800/20 px-4 py-3 text-[11px] text-zinc-500">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border border-zinc-700 border-t-zinc-400" />
        A carregar dados de pagamento…
      </div>
    );
  }

  const rows = paymentRows(method, settings);
  const allEmpty = rows.every((r) => r.value === "—");

  if (allEmpty) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/25 px-4 py-3 text-[11px] text-red-200/90">
        Os dados para este método ainda não estão configurados. Escolhe outro método
        ou contacta a equipa Dádiva.
      </div>
    );
  }

  const ibanRow = rows.find((r) => r.label.includes("IBAN") || r.label.includes("Conta"));

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
          Dados para {PAYMENT_METHOD_LABELS[method]}
        </p>
        {ibanRow ? (
          <button
            type="button"
            onClick={() => {
              void copyText(ibanRow.value).then((ok) => {
                if (ok) setCopied("iban");
              });
            }}
            className="shrink-0 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-400/20"
          >
            {copied === "iban" ? "Copiado ✓" : "Copiar IBAN"}
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-500">{r.label}</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-xs font-semibold text-white select-all">
                {r.value}
              </span>
              <button
                type="button"
                title={`Copiar ${r.label}`}
                onClick={() => {
                  void copyText(r.value).then((ok) => {
                    if (ok) setCopied(r.label);
                  });
                }}
                className="shrink-0 rounded p-1 text-zinc-500 transition hover:text-amber-300"
                aria-label={`Copiar ${r.label}`}
              >
                {copied === r.label ? (
                  <span className="text-[9px] text-amber-300">✓</span>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" />
                    <path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H11" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderSummaryBlock({ order }: { order: OrderDetail }) {
  const discount = coerceFiniteNumber(order.discountAmount);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
        Resumo
      </p>
      <div className="space-y-1.5">
        {order.items.map((item) => {
          const meta = orderLineMeta(
            item.metadata as Record<string, unknown> | null | undefined,
          );
          const extra =
            meta.color !== "—" || meta.size !== "—"
              ? [meta.color !== "—" ? meta.color : null, meta.size !== "—" ? meta.size : null]
                  .filter(Boolean)
                  .join(" · ")
              : null;
          return (
            <div key={item.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-200">
                  {item.productName}
                </p>
                {extra ? (
                  <p className="text-[10px] text-zinc-500">{extra}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                ×{item.quantity}
              </span>
            </div>
          );
        })}
      </div>
      {discount != null && discount > 0 ? (
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
          <span className="text-zinc-500">Desconto</span>
          <span className="tabular-nums text-emerald-300/90">
            −{formatMoney(discount, order.currency)}
          </span>
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Total
        </span>
        <span className="text-base font-bold tabular-nums text-amber-300">
          {formatMoney(order.totalAmount, order.currency)}
        </span>
      </div>
    </div>
  );
}

type Props = {
  order: OrderDetail;
  designPreviewUrl?: string | null;
  viewerRole?: string;
  onBackToDesign?: () => void;
  onClose: () => void;
  onConfirm: (
    paymentMethod: PaymentMethodValue,
    proofFile?: File,
  ) => Promise<OrderDetail>;
  onFinished: (detail: OrderDetail) => void;
};

export function SubmitOrderModal({
  order,
  designPreviewUrl,
  viewerRole = "CLIENT",
  onBackToDesign,
  onClose,
  onConfirm,
  onFinished,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ModalPhase>("review");
  const [selected, setSelected] = useState<PaymentMethodValue | null>(null);
  const [paySettings, setPaySettings] = useState<ClientCheckoutPaymentSettings | null>(
    null,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<OrderDetail | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const finishOnceRef = useRef(false);
  const isClient = !isStaffRole(viewerRole);

  const finishOnce = useCallback(
    (detail: OrderDetail) => {
      if (finishOnceRef.current) return;
      finishOnceRef.current = true;
      onFinished(detail);
    },
    [onFinished],
  );

  useEffect(() => {
    dialogRef.current?.focus();
    try {
      const saved = localStorage.getItem(LAST_METHOD_KEY) as PaymentMethodValue | null;
      if (saved && PAYMENT_OPTIONS.some((o) => o.value === saved)) {
        setSelected(saved);
      }
    } catch {
      /* ignorar */
    }
  }, []);

  useEffect(() => {
    getClientCheckoutPaymentSettings()
      .then(setPaySettings)
      .catch(() => setPaySettings(null))
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!settingsLoaded || !selected) return;
    if (!paymentMethodSelectableInCheckout(selected, paySettings, settingsLoaded)) {
      setSelected(null);
    }
  }, [settingsLoaded, paySettings, selected]);

  useEffect(() => {
    if (!proofFile?.type.startsWith("image/")) {
      setProofPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  useEffect(() => {
    if (phase !== "success" || !successDetail) return;
    const timer = window.setTimeout(() => finishOnce(successDetail), 1600);
    return () => window.clearTimeout(timer);
  }, [phase, successDetail, finishOnce]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && phase !== "success") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, phase]);

  const needsProof = selected !== null && selected !== CASH_METHOD;
  const methodReady =
    selected !== null &&
    paymentMethodReadyForSubmit(selected, paySettings, settingsLoaded);

  const missingSteps = useMemo(() => {
    const items: string[] = [];
    if (!selected) items.push("Selecciona o método de pagamento");
    else if (
      settingsLoaded &&
      selected !== CASH_METHOD &&
      !paymentMethodEnabledInCheckout(selected, paySettings)
    ) {
      items.push("Método desactivado — escolhe outro");
    } else if (selected && settingsLoaded && !paymentMethodHasRequiredData(selected, paySettings)) {
      items.push("Dados bancários incompletos — contacta a equipa ou escolhe outro método");
    }
    if (needsProof && !proofFile) items.push("Anexa o comprovativo");
    if (!agreed) items.push("Confirma a caixa abaixo");
    return items;
  }, [selected, paySettings, settingsLoaded, needsProof, proofFile, agreed]);

  const canSubmit =
    !!selected && methodReady && agreed && (!needsProof || !!proofFile) && !busy;

  const agreeLabel =
    selected === CASH_METHOD
      ? "Confirmo que revi o design e pagarei na loja. Após submeter, o design só pode ser alterado contactando a equipa Dádiva."
      : needsProof
        ? "Confirmo que efectuei o pagamento, anexei o comprovativo e o design está correcto. Após submeter, o design não pode ser alterado sem contactar a equipa Dádiva."
        : "Confirmo que o design está correcto. Após submeter, o design não pode ser alterado sem contactar a equipa Dádiva.";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setProofError(null);
    if (!f) {
      setProofFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setProofError("Ficheiro demasiado grande (máx. 10 MB).");
      e.target.value = "";
      return;
    }
    setProofFile(f);
  }

  function onDropProof(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setProofError("Ficheiro demasiado grande (máx. 10 MB).");
      return;
    }
    setProofFile(f);
    setProofError(null);
  }

  async function handleConfirm() {
    if (!selected) {
      setError("Seleciona um método de pagamento.");
      return;
    }
    if (!methodReady) {
      setError(
        selected && !paymentMethodEnabledInCheckout(selected, paySettings)
          ? "Este método está desactivado. Escolhe outra opção."
          : "Completa os dados deste método em Admin → Pagamentos ou escolhe outra opção.",
      );
      return;
    }
    if (needsProof && !proofFile) {
      setError("Anexa o comprovativo de pagamento.");
      return;
    }
    if (!agreed) {
      setError("Confirma a declaração abaixo.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const detail = await onConfirm(selected, proofFile ?? undefined);
      try {
        localStorage.setItem(LAST_METHOD_KEY, selected);
      } catch {
        /* ignorar */
      }
      setSuccessDetail(detail);
      setPhase("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível submeter. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !busy && phase !== "success" && onClose()}
        aria-hidden
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-order-title"
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/70 sm:rounded-2xl sm:border-zinc-700/50"
        style={{ maxHeight: "min(92dvh, 720px)" }}
      >
        <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800/60 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-zinc-500">Passo 3 de 3 · Submissão</p>
            <h2 id="submit-order-title" className="text-sm font-bold text-white sm:text-base">
              Submeter pedido
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {isClient ? (
                <>
                  O teu pedido{" "}
                  <span className="font-semibold text-zinc-300">{order.orderNumber}</span>
                </>
              ) : (
                <>
                  Pedido{" "}
                  <span className="font-semibold text-zinc-300">{order.orderNumber}</span>
                  {order.client?.name ? (
                    <span className="text-zinc-600"> · {order.client.name}</span>
                  ) : null}
                </>
              )}
            </p>
            <OrderCreationWizard
              activeStep={3}
              step1Href={
                isClient && order.status === "DRAFT"
                  ? contaPedidoArtigosPath(order.id)
                  : undefined
              }
              className="mt-2 max-w-md"
            />
            {isClient && order.status === "DRAFT" ? (
              <Link
                href={contaPedidoArtigosPath(order.id)}
                className="mt-2 inline-flex text-[11px] font-semibold text-amber-300/95 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-200"
              >
                ← Voltar a escolher os artigos
              </Link>
            ) : null}
          </div>
          {phase !== "success" ? (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Fechar"
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Indicador de fase interna */}
        {phase !== "success" ? (
          <div className="flex shrink-0 gap-1 border-b border-zinc-800/50 px-4 py-2 sm:px-5">
            {(
              [
                { id: "review" as const, label: "1. Rever" },
                { id: "payment" as const, label: "2. Pagamento" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => phase !== s.id && !busy && setPhase(s.id)}
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-semibold transition sm:text-[11px] ${
                  phase === s.id
                    ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {phase === "success" && successDetail ? (
            <div className="space-y-4 p-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/35">
                <svg className="h-7 w-7 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Pedido submetido</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Referência{" "}
                  <span className="font-semibold text-amber-200">
                    {successDetail.orderNumber}
                  </span>
                </p>
              </div>
              <p className="text-[12px] leading-relaxed text-zinc-500">
                A equipa Dádiva irá analisar o pagamento e confirmar o pedido. Podes acompanhar
                o estado na área «Os meus pedidos».
              </p>
              {designPreviewUrl ? (
                <div className="mx-auto max-w-[200px] overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={designPreviewUrl}
                    alt="Pré-visualização do design submetido"
                    className="mx-auto max-h-36 w-auto object-contain"
                  />
                </div>
              ) : null}
            </div>
          ) : phase === "review" ? (
            <div className="space-y-4 p-4 sm:p-5">
              {designPreviewUrl ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Pré-visualização do design
                    </p>
                    {onBackToDesign ? (
                      <button
                        type="button"
                        onClick={onBackToDesign}
                        className="text-[10px] font-semibold text-amber-400/90 hover:text-amber-300"
                      >
                        ← Voltar ao editor
                      </button>
                    ) : null}
                  </div>
                  <div className="flex justify-center rounded-xl border border-white/[0.08] bg-[conic-gradient(#27272a_25%,#18181b_0_50%,#27272a_0_75%,#18181b_0)] bg-[length:12px_12px] p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={designPreviewUrl}
                      alt="Design a submeter"
                      className="max-h-[min(38vh,280px)] w-auto max-w-full object-contain drop-shadow-lg"
                    />
                  </div>
                </div>
              ) : null}
              <OrderSummaryBlock order={order} />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Confirma que o design e os artigos estão correctos antes de escolher o pagamento.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              <OrderSummaryBlock order={order} />

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Método de pagamento
                </p>
                <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 sm:gap-1.5">
                  {PAYMENT_OPTIONS.map((opt) => {
                    const selectable = paymentMethodSelectableInCheckout(
                      opt.value,
                      paySettings,
                      settingsLoaded,
                    );
                    const hasData = paymentMethodHasRequiredData(opt.value, paySettings);
                    const active = selected === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={settingsLoaded && !selectable}
                        onClick={() => {
                          if (!selectable) return;
                          setSelected(opt.value);
                          setProofFile(null);
                          setProofError(null);
                          setError(null);
                        }}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition sm:py-2.5 ${
                          active
                            ? "border-amber-400/50 bg-amber-400/10 text-white ring-1 ring-amber-400/30"
                            : selectable
                              ? hasData || opt.value === CASH_METHOD
                                ? "border-white/[0.07] bg-black/20 text-zinc-400 hover:border-white/15 hover:bg-black/40 hover:text-zinc-200"
                                : "border-amber-500/20 bg-amber-950/10 text-zinc-400 hover:border-amber-400/25 hover:text-zinc-200"
                              : "cursor-not-allowed border-zinc-800/80 bg-zinc-950/40 text-zinc-600 opacity-60"
                        }`}
                      >
                        <span className="text-base">{opt.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold leading-tight">
                            {opt.short}
                          </span>
                          <span className="block text-[10px] text-zinc-500">{opt.hint}</span>
                        </span>
                        {active ? (
                          <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selected !== null ? (
                <PaymentDetails
                  method={selected}
                  settings={paySettings}
                  settingsLoaded={settingsLoaded}
                />
              ) : null}

              {needsProof ? (
                <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/20 p-3.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Comprovativo de pagamento <span className="text-amber-400">*</span>
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PROOF_ACCEPT}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                  {proofFile ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
                        {proofPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proofPreviewUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/30 text-[10px] text-zinc-400">
                            PDF
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-200">
                            {proofFile.name}
                          </p>
                          <p className="text-[10px] text-zinc-500">{formatBytes(proofFile.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setProofFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="shrink-0 rounded p-1 text-zinc-500 hover:text-red-400"
                          aria-label="Remover ficheiro"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={onDropProof}
                      className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-700/50 bg-black/20 py-5 text-zinc-500 transition hover:border-amber-400/30 hover:bg-amber-400/5 hover:text-zinc-300"
                    >
                      <span className="text-xs font-medium">Clica ou arrasta o comprovativo</span>
                      <span className="text-[10px] text-zinc-600">PNG, JPG ou PDF — máx. 10 MB</span>
                    </button>
                  )}
                  {proofError ? (
                    <p className="mt-1.5 text-[11px] text-red-400">{proofError}</p>
                  ) : null}
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                />
                <span className="text-[11px] leading-relaxed text-zinc-400">{agreeLabel}</span>
              </label>

              {!canSubmit && missingSteps.length > 0 ? (
                <div className="rounded-xl border border-zinc-700/40 bg-zinc-950/50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Para submeter
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {missingSteps.map((s) => (
                      <li key={s} className="text-[11px] text-zinc-400">
                        · {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? (
                <p className="rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-zinc-800/60 px-4 py-3.5 sm:px-5">
          {phase === "success" && successDetail ? (
            <button
              type="button"
              onClick={() => finishOnce(successDetail)}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
            >
              Ver pedido
            </button>
          ) : phase === "review" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-zinc-700/60 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setPhase("payment")}
                className="flex-[1.4] rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-sm font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400"
              >
                Continuar para pagamento
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPhase("review")}
                  disabled={busy}
                  className="hidden rounded-xl border border-zinc-700/60 px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 sm:inline-flex sm:items-center"
                >
                  ← Rever
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-zinc-700/60 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={!canSubmit}
                  className={`flex-[1.35] rounded-xl py-2.5 text-sm font-bold transition ${
                    canSubmit
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 text-zinc-950 shadow-md shadow-amber-500/25 hover:from-amber-300 hover:to-amber-400"
                      : "cursor-not-allowed bg-zinc-700/80 text-zinc-500"
                  }`}
                >
                  {busy ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border border-zinc-900/30 border-t-zinc-900" />
                      A submeter…
                    </span>
                  ) : (
                    "Confirmar e submeter"
                  )}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-zinc-600">
                Após submeter, o pedido ficará em análise até confirmação da equipa.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
