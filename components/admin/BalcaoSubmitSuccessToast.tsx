"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  runFloatingProgressToastEnter,
  runFloatingProgressToastExitThen,
  runProgressBarFill,
} from "@/lib/anime-ui";
import { deliverPaymentReceipt } from "@/lib/order-document-flow";
import { documentReprintActionLabel } from "@/lib/invoice-document-policy";
import type { PaymentReceiptPdfPayload } from "@/lib/payment-receipt-pdf";
import { ROUTES } from "@/lib/routes";

const FILL_DURATION_MS = 2050;
const HOLD_AFTER_FILL_MS = 5000;

type Props = {
  receiptPayload: PaymentReceiptPdfPayload | null;
  onDismiss: () => void;
  onReprint?: () => void | Promise<void>;
  reprintBusy?: boolean;
};

export function BalcaoSubmitSuccessToast({
  receiptPayload,
  onDismiss,
  onReprint,
  reprintBusy = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount para createPortal no document.body
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    const fill = fillRef.current;
    if (!panel || !fill) return;

    let cancelled = false;
    /** DOM timers are numeric; avoids NodeJS.Timeout vs `number` mismatch in TS. */
    let holdTimerId: number | undefined;

    const cleanToastEnter = runFloatingProgressToastEnter(panel);
    const { finished: fillFinished, cancel: cancelFill } = runProgressBarFill(
      fill,
      { duration: FILL_DURATION_MS },
    );

    void fillFinished.then(() => {
      if (cancelled) return;
      holdTimerId = window.setTimeout(() => {
        if (cancelled) return;
        runFloatingProgressToastExitThen(panel, () => {
          if (!cancelled) onDismiss();
        });
      }, HOLD_AFTER_FILL_MS);
    });

    return () => {
      cancelled = true;
      if (holdTimerId !== undefined) window.clearTimeout(holdTimerId);
      cleanToastEnter();
      cancelFill();
      panel.style.opacity = "";
      panel.style.translate = "";
    };
  }, [mounted, onDismiss]);

  if (!mounted) return null;

  const node = (
    <div className="fixed top-6 right-4 z-[115] flex w-[min(100vw-2rem,22rem)] max-w-[calc(100vw-2rem)] flex-col sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
      <div
        ref={panelRef}
        role="status"
        aria-live="polite"
        className="relative overflow-hidden rounded-xl border border-zinc-200/95 bg-white/98 p-4 shadow-[0_22px_50px_-12px_rgba(0,0,0,0.28)] backdrop-blur-sm ring-1 ring-black/[0.04] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-amber-500 before:via-violet-500 before:to-sky-500 before:opacity-95 before:content-[''] dark:border-zinc-700 dark:bg-zinc-900/98 dark:ring-white/[0.06]"
      >
        <p className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-white">
          Pedido submetido com sucesso
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          A confirmar pedido · podes repetir a emissão ou abrir pedidos através
          dos atalhos.
        </p>
        <div className="mt-3 overflow-hidden rounded-full bg-zinc-200/95 dark:bg-zinc-700/95">
          <div
            ref={fillRef}
            className="h-2 w-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 shadow-inner shadow-black/25"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {receiptPayload && onReprint ? (
            <button
              type="button"
              disabled={reprintBusy}
              onClick={() => void onReprint()}
              className="rounded-md text-amber-800 underline underline-offset-2 hover:text-amber-600 disabled:opacity-50 dark:text-amber-300 dark:hover:text-amber-200"
            >
              {reprintBusy
                ? "A preparar…"
                : documentReprintActionLabel(receiptPayload.documentModel)}
            </button>
          ) : receiptPayload ? (
            <button
              type="button"
              onClick={() => void deliverPaymentReceipt(receiptPayload)}
              className="rounded-md text-amber-800 underline underline-offset-2 hover:text-amber-600 dark:text-amber-300 dark:hover:text-amber-200"
            >
              {documentReprintActionLabel(receiptPayload.documentModel)}
            </button>
          ) : null}
          <Link
            href={ROUTES.admin.pedidos}
            className="rounded-md text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            Ir para pedidos →
          </Link>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
