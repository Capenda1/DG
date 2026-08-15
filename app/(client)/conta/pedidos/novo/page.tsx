"use client";

import { PedidoArtigosEditor } from "@/components/pedidos/PedidoArtigosEditor";
import { PedidoAreaArtigosEditor } from "@/components/pedidos/PedidoAreaArtigosEditor";
import { PedidoGenericArtigosEditor } from "@/components/pedidos/PedidoGenericArtigosEditor";
import { usePedidoArtigos } from "@/components/pedidos/usePedidoArtigos";
import { usePedidoAreaArtigos } from "@/components/pedidos/usePedidoAreaArtigos";
import { usePedidoGenericArtigos } from "@/components/pedidos/usePedidoGenericArtigos";
import {
  createOrder,
  listCatalogProducts,
  type CatalogProduct,
  type CreateOrderBody,
} from "@/lib/api-client";
import {
  areaCatalogSyncActive,
  buildItemsFromAreaLines,
  estimateAreaSubtotal,
} from "@/lib/area-pricing-catalog";
import {
  buildItemsFromPedidoArtigos,
  estimateArtigosSubtotal,
  isCatalogSyncActive,
} from "@/lib/pedido-artigos-lines";
import {
  buildItemsFromGenericLines,
  estimateGenericSubtotal,
  genericCatalogSyncActive,
} from "@/lib/pedido-generic-lines";
import { formatMoney } from "@/lib/format-money";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRegisterBottomBar } from "@/lib/app-bottom-bar";
import { contaPedidoModelagemPath, ROUTES } from "@/lib/routes";
import { OrderCreationWizard } from "@/components/order/OrderCreationWizard";

type ArtigoTab = "vestuario" | "generico" | "area";

function TabButton({
  active,
  label,
  badge,
  complete,
  onClick,
}: {
  active: boolean;
  label: string;
  badge: string;
  complete: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition duration-300 sm:text-sm ${
        active
          ? "conta-filter-pill--active bg-amber-400/15 text-amber-800 ring-1 ring-amber-400/40 dark:text-amber-100"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/[0.04] dark:hover:text-zinc-300"
      }`}
    >
      {complete ? (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300"
          aria-hidden
        >
          ✓
        </span>
      ) : null}
      <span className="truncate">{label}</span>
      {badge ? (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            active
              ? "bg-amber-400/20 text-amber-900 dark:text-amber-200"
              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default function NovoPedidoPage() {
  const router = useRouter();
  const stickyFooterRef = useRef<HTMLDivElement>(null);
  useRegisterBottomBar(stickyFooterRef);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ArtigoTab>("vestuario");

  const {
    lines,
    catalogSyncActive,
    grandTotalPieces,
    addLine,
    removeLine,
    patchLine,
    patchSizeQty,
  } = usePedidoArtigos(catalog);

  const {
    lines: genericLines,
    genericSyncActive,
    grandTotalPieces: genericGrandTotal,
    addLine: addGenericLine,
    removeLine: removeGenericLine,
    patchLine: patchGenericLine,
    patchQty: patchGenericQty,
  } = usePedidoGenericArtigos(catalog);

  const {
    lines: areaLines,
    areaSyncActive,
    activeLineCount: areaActiveLineCount,
    addLine: addAreaLine,
    removeLine: removeAreaLine,
    patchLine: patchAreaLine,
    patchDimension: patchAreaDimension,
    patchQty: patchAreaQty,
  } = usePedidoAreaArtigos(catalog);

  const orderCatalogActive = useMemo(
    () =>
      isCatalogSyncActive(catalog) ||
      genericCatalogSyncActive(catalog) ||
      areaCatalogSyncActive(catalog),
    [catalog],
  );

  const catalogLoading = catalog === null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCatalogProducts();
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogArr = catalog ?? [];

  const { total: apparelSubtotal, currency } = useMemo(
    () => estimateArtigosSubtotal(lines, catalog),
    [lines, catalog],
  );
  const genericSubtotal = useMemo(
    () => estimateGenericSubtotal(genericLines, catalogArr),
    [genericLines, catalogArr],
  );
  const areaSubtotal = useMemo(
    () => estimateAreaSubtotal(areaLines, catalogArr),
    [areaLines, catalogArr],
  );

  const grandTotalMoney = apparelSubtotal + genericSubtotal + areaSubtotal;
  const totalPieces =
    grandTotalPieces + genericGrandTotal + areaActiveLineCount;

  const vestuarioComplete = grandTotalPieces >= 1;
  const genericoComplete = genericGrandTotal >= 1;
  const areaComplete = areaActiveLineCount >= 1;
  const hasAnyArtigos =
    vestuarioComplete || genericoComplete || areaComplete;

  const catalogUnavailableHint =
    catalog !== null && !orderCatalogActive
      ? "Não há variantes activas no catálogo. Não é possível criar um pedido até o administrador publicar produtos e preços."
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!catalog?.length || !orderCatalogActive) {
        throw new Error(
          "O catálogo não está disponível. Não é possível criar um pedido sem variantes activas e preços definidos pela Dádiva.",
        );
      }
      const cat = catalog;
      const items: CreateOrderBody["items"] = [];

      if (grandTotalPieces >= 1) {
        const built = buildItemsFromPedidoArtigos(lines, cat);
        if (!built.ok) throw new Error(built.message);
        items.push(...built.items);
      }

      if (genericGrandTotal >= 1) {
        const builtG = buildItemsFromGenericLines(genericLines, cat);
        if (!builtG.ok) throw new Error(builtG.message);
        items.push(...builtG.items);
      }

      if (areaActiveLineCount >= 1) {
        const builtA = buildItemsFromAreaLines(areaLines, cat);
        if (!builtA.ok) throw new Error(builtA.message);
        items.push(...builtA.items);
      }

      if (items.length === 0) {
        throw new Error(
          "Adiciona pelo menos um artigo de vestuário, canecas / impressão plana, ou lona / vinil.",
        );
      }

      const body: CreateOrderBody = { items };
      const order = await createOrder(body);
      router.push(contaPedidoModelagemPath(order.id));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível criar o pedido.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Hero */}
      <section
        className="conta-animate-fade-up relative mb-5 overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-4 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.2)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] sm:px-6 sm:py-5"
        style={{ "--conta-delay": "0ms" } as CSSProperties}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-400/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-violet-500/10 blur-xl dark:bg-violet-500/8" />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={ROUTES.accountPedidos}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 transition hover:text-amber-600 dark:text-amber-400/90 dark:hover:text-amber-300"
            >
              ← Voltar aos pedidos
            </Link>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
              Novo pedido
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              Escolhe os artigos
            </h1>
            <p className="mt-1.5 max-w-md text-[12px] leading-snug text-zinc-600 dark:text-zinc-400 sm:text-[13px]">
              Passo 1 de 3 — adiciona vestuário, canecas ou lonas. Depois segues para o design.
            </p>
          </div>
          <div className="hidden shrink-0 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1 text-[10px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 sm:block">
            Passo 1 · Artigos
          </div>
        </div>

        <OrderCreationWizard activeStep={1} className="relative mt-4" />
      </section>

      {catalogLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="A carregar catálogo">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="conta-skeleton-shimmer h-36 rounded-2xl ring-1 ring-zinc-200/50 dark:ring-white/[0.04]"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : (
        <form id="novo-pedido-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Tabs */}
          <div
            className="conta-animate-fade-up flex gap-1 rounded-2xl border border-zinc-200/80 bg-white/70 p-1 dark:border-white/[0.07] dark:bg-zinc-900/40"
            style={{ "--conta-delay": "80ms" } as CSSProperties}
            role="tablist"
            aria-label="Tipo de artigos"
          >
            <TabButton
              active={tab === "vestuario"}
              label="Vestuário"
              badge={grandTotalPieces > 0 ? String(grandTotalPieces) : ""}
              complete={vestuarioComplete}
              onClick={() => setTab("vestuario")}
            />
            <TabButton
              active={tab === "generico"}
              label="Canecas / plano"
              badge={genericGrandTotal > 0 ? String(genericGrandTotal) : ""}
              complete={genericoComplete}
              onClick={() => setTab("generico")}
            />
            <TabButton
              active={tab === "area"}
              label="Lona / Vinil"
              badge={areaActiveLineCount > 0 ? String(areaActiveLineCount) : ""}
              complete={areaComplete}
              onClick={() => setTab("area")}
            />
          </div>

          <div key={tab} className="conta-animate-fade-up" role="tabpanel">
            {tab === "vestuario" ? (
              <PedidoArtigosEditor
                catalog={catalog}
                catalogSyncActive={catalogSyncActive}
                lines={lines}
                grandTotalPieces={grandTotalPieces}
                addLine={addLine}
                removeLine={removeLine}
                patchLine={patchLine}
                patchSizeQty={patchSizeQty}
                catalogUnavailableHint={catalogUnavailableHint}
                uiVariant="conta"
                sectionTitle="Vestuário"
                addLineButtonLabel="+ Adicionar peça"
              />
            ) : null}
            {tab === "generico" ? (
              <PedidoGenericArtigosEditor
                catalog={catalog}
                genericSyncActive={genericSyncActive}
                lines={genericLines}
                grandTotalPieces={genericGrandTotal}
                addLine={addGenericLine}
                removeLine={removeGenericLine}
                patchLine={patchGenericLine}
                patchQty={patchGenericQty}
                catalogUnavailableHint={catalogUnavailableHint}
                uiVariant="conta"
              />
            ) : null}
            {tab === "area" ? (
              <PedidoAreaArtigosEditor
                catalog={catalog}
                areaSyncActive={areaSyncActive}
                lines={areaLines}
                activeLineCount={areaActiveLineCount}
                addLine={addAreaLine}
                removeLine={removeAreaLine}
                patchLine={patchAreaLine}
                patchDimension={patchAreaDimension}
                patchQty={patchAreaQty}
                catalogUnavailableHint={catalogUnavailableHint}
                uiVariant="conta"
              />
            ) : null}
          </div>

          {!hasAnyArtigos && !catalogUnavailableHint ? (
            <p
              className="conta-animate-scale-in rounded-xl border border-dashed border-zinc-300 bg-white/50 px-4 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900/30"
              style={{ "--conta-delay": "120ms" } as CSSProperties}
            >
              Adiciona artigos numa das categorias acima para continuar.
            </p>
          ) : null}

          {error ? (
            <div
              className="conta-animate-scale-in rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </form>
      )}

      {/* Sticky footer */}
      {!catalogLoading ? (
        <div
          ref={stickyFooterRef}
          className="conta-animate-fade-up fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/90 bg-white/95 px-4 py-3 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.15)] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/95 dark:shadow-[0_-16px_48px_-24px_rgba(0,0,0,0.5)]"
          style={{ "--conta-delay": "160ms" } as CSSProperties}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Estimativa
              </p>
              <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {grandTotalMoney > 0
                  ? formatMoney(grandTotalMoney, currency)
                  : "—"}
              </p>
              <p className="text-[11px] text-zinc-500">
                {totalPieces > 0
                  ? `${totalPieces} artigo${totalPieces !== 1 ? "s" : ""} / linha${totalPieces !== 1 ? "s" : ""}`
                  : "Sem artigos seleccionados"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={ROUTES.accountPedidos}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-300/80 bg-white/60 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-900 sm:flex-none"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                form="novo-pedido-form"
                disabled={loading || !orderCatalogActive || !hasAnyArtigos}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-400/25 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              >
                {loading ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                    A criar…
                  </>
                ) : (
                  "Continuar para design"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
