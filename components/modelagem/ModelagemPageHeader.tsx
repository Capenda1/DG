"use client";

import type { CSSProperties } from "react";
import { OrderCreationWizard } from "@/components/order/OrderCreationWizard";
import { OrderPhaseStrip } from "@/components/order/OrderPhaseStrip";
import { ModelagemExitLink } from "@/components/modelagem/ModelagemExitLink";
import { orderStatusLabel } from "@/lib/order-status";
import { isBalcaoInstantInsumosOrder } from "@/lib/order-line-meta";
import type { OrderDetail } from "@/lib/api-client";
import { contaPedidoPath } from "@/lib/routes";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-zinc-200/80 text-zinc-700 ring-zinc-300/60 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-700/60";
    case "SUBMITTED":
      return "bg-blue-100 text-blue-800 ring-blue-300/50 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-500/35";
    case "VALIDATION_PAYMENT":
      return "bg-violet-100 text-violet-800 ring-violet-300/50 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-500/35";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800 ring-emerald-300/50 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-500/35";
    case "IN_PRODUCTION":
      return "bg-indigo-100 text-indigo-800 ring-indigo-300/50 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-violet-500/35";
    case "FINISHED":
      return "bg-purple-100 text-purple-800 ring-purple-300/50 dark:bg-purple-950/50 dark:text-purple-200 dark:ring-purple-500/35";
    case "DELIVERED":
      return "bg-amber-100 text-amber-900 ring-amber-300/50 dark:bg-zinc-950/50 dark:text-amber-200 dark:ring-amber-600/35";
    case "CANCELLED":
      return "bg-red-100 text-red-800 ring-red-300/50 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-500/35";
    default:
      return "bg-zinc-200/80 text-zinc-700 ring-zinc-300/60 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-700/60";
  }
}

export function ModelagemPageHeader({
  order,
  exitHref,
  exitLabel,
  baseColorHex,
  previewCaption,
  showWizard,
  unsaved,
  refreshing,
  onRefresh,
  isClientOnlineDraft,
}: {
  order: OrderDetail;
  exitHref: string;
  exitLabel: string;
  baseColorHex: string;
  previewCaption?: string;
  showWizard: boolean;
  unsaved: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  isClientOnlineDraft: boolean;
}) {
  const insumosOnly = isBalcaoInstantInsumosOrder(order);

  return (
    <section
      className="conta-animate-fade-up relative mb-3 overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-3 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.18)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] sm:mb-4 sm:px-6 sm:py-4"
      style={{ "--conta-delay": "0ms" } as CSSProperties}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
        aria-hidden
      />
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-400/10" />
      <div className="pointer-events-none absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-violet-500/10 blur-xl dark:bg-violet-500/8" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ModelagemExitLink
              href={exitHref}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-700 transition hover:text-amber-600 dark:text-amber-400/90 dark:hover:text-amber-300"
            >
              <span className="transition group-hover:-translate-x-0.5">←</span>
              {exitLabel}
            </ModelagemExitLink>
            {unsaved ? (
              <span
                className="conta-animate-scale-in rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 ring-1 ring-amber-400/25 dark:text-amber-200"
                role="status"
              >
                Por guardar
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
            {showWizard ? "Passo 2 · Design" : "Editor de modelagem"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-xl">
              Design · {order.orderNumber}
            </h1>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ${statusBadgeClass(order.status)}`}
            >
              {orderStatusLabel(order.status)}
            </span>
            <span
              className="h-4 w-4 shrink-0 rounded ring-1 ring-zinc-400/40 dark:ring-zinc-600/50"
              style={{ backgroundColor: baseColorHex }}
              title={previewCaption}
            />
          </div>
          {order.items.length > 0 ? (
            <p className="mt-1 truncate text-[11px] text-zinc-500">
              {order.items[0]!.productName}
              {order.items.length > 1 ? ` +${order.items.length - 1}` : ""}
            </p>
          ) : null}
          {showWizard ? (
            <p className="mt-1.5 hidden text-[12px] leading-snug text-zinc-600 dark:text-zinc-400 sm:block">
              Cria a arte — depois submetes o pedido no passo 3.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              disabled={refreshing}
              onClick={onRefresh}
              title="Actualizar pedido"
              className="rounded-lg border border-zinc-300/80 bg-white/70 px-2.5 py-1.5 text-[10px] font-medium text-zinc-600 transition hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700/50 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {refreshing ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-amber-500 dark:border-zinc-600 dark:border-t-amber-400" />
              ) : (
                "↻ Actualizar"
              )}
            </button>
          ) : null}
          {showWizard ? (
            <span className="hidden rounded-full border border-zinc-200/80 bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 sm:inline">
              Passo 2 de 3
            </span>
          ) : null}
        </div>
      </div>

      {showWizard ? (
        <OrderCreationWizard
          activeStep={2}
          step1Href={isClientOnlineDraft ? contaPedidoPath(order.id) : undefined}
          className="relative mt-3"
        />
      ) : (
        <div className="relative mt-3">
          <OrderPhaseStrip
            status={order.status}
            compact
            balcaoInsumosOnly={insumosOnly}
          />
        </div>
      )}
    </section>
  );
}

export { statusBadgeClass };
