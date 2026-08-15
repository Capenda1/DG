"use client";

import { PedidoArtigosEditor } from "@/components/pedidos/PedidoArtigosEditor";
import { PedidoAreaArtigosEditor } from "@/components/pedidos/PedidoAreaArtigosEditor";
import { PedidoGenericArtigosEditor } from "@/components/pedidos/PedidoGenericArtigosEditor";
import { usePedidoArtigos } from "@/components/pedidos/usePedidoArtigos";
import { usePedidoAreaArtigos } from "@/components/pedidos/usePedidoAreaArtigos";
import { usePedidoGenericArtigos } from "@/components/pedidos/usePedidoGenericArtigos";
import { OrderCreationWizard } from "@/components/order/OrderCreationWizard";
import {
  getOrder,
  listCatalogProducts,
  replaceClientDraftOrderItems,
  type CatalogProduct,
  type CreateOrderBody,
  type OrderDetail,
} from "@/lib/api-client";
import {
  areaCatalogSyncActive,
  buildItemsFromAreaLines,
  estimateAreaSubtotal,
} from "@/lib/area-pricing-catalog";
import { hydratePedidoFormsFromOrderItems } from "@/lib/hydrate-pedido-from-order";
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
import { useRegisterBottomBar } from "@/lib/app-bottom-bar";
import {
  contaPedidoModelagemPath,
  ROUTES,
} from "@/lib/routes";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

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

export default function EditarArtigosPedidoPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = typeof params.id === "string" ? params.id : "";
  const stickyFooterRef = useRef<HTMLDivElement>(null);
  useRegisterBottomBar(stickyFooterRef);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<ArtigoTab>("vestuario");

  const {
    lines,
    catalogSyncActive,
    grandTotalPieces,
    addLine,
    removeLine,
    patchLine,
    patchSizeQty,
    setLines,
  } = usePedidoArtigos(catalog);

  const {
    lines: genericLines,
    genericSyncActive,
    grandTotalPieces: genericGrandTotal,
    addLine: addGenericLine,
    removeLine: removeGenericLine,
    patchLine: patchGenericLine,
    patchQty: patchGenericQty,
    setLines: setGenericLines,
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
    setLines: setAreaLines,
  } = usePedidoAreaArtigos(catalog);

  const orderCatalogActive = useMemo(
    () =>
      isCatalogSyncActive(catalog) ||
      genericCatalogSyncActive(catalog) ||
      areaCatalogSyncActive(catalog),
    [catalog],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBooting(true);
      setLoadError(null);
      try {
        const [ord, cat] = await Promise.all([
          getOrder(orderId),
          listCatalogProducts(),
        ]);
        if (cancelled) return;
        if (ord.status !== "DRAFT") {
          setLoadError("Só podes editar artigos de pedidos em rascunho.");
          setOrder(ord);
          setCatalog(cat);
          return;
        }
        if (ord.orderOrigin === "BALCAO") {
          setLoadError(
            "Este pedido é de balcão — edita os artigos no PDV.",
          );
          setOrder(ord);
          setCatalog(cat);
          return;
        }
        setOrder(ord);
        setCatalog(cat);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar o pedido.",
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (hydrated || !order || !catalog || order.status !== "DRAFT") return;
    if (order.orderOrigin === "BALCAO") return;
    const h = hydratePedidoFormsFromOrderItems(order.items, catalog);
    setLines(h.apparel);
    setGenericLines(h.generic);
    setAreaLines(h.area);
    if (h.apparel.some((l) => Object.values(l.sizeQuantities).some(Boolean))) {
      setTab("vestuario");
    } else if (
      h.generic.some((l) => (parseInt(l.quantity, 10) || 0) > 0)
    ) {
      setTab("generico");
    } else if (
      h.area.some(
        (l) => l.widthM.trim() !== "" && l.heightM.trim() !== "",
      )
    ) {
      setTab("area");
    }
    setHydrated(true);
  }, [
    hydrated,
    order,
    catalog,
    setLines,
    setGenericLines,
    setAreaLines,
  ]);

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
      ? "Não há variantes activas no catálogo. Não é possível actualizar o pedido."
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    setError(null);
    setLoading(true);
    try {
      if (!catalog?.length || !orderCatalogActive) {
        throw new Error(
          "O catálogo não está disponível. Não é possível actualizar o pedido.",
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

      await replaceClientDraftOrderItems(order.id, { items });
      router.push(contaPedidoModelagemPath(order.id));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível actualizar os artigos.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 pb-28" aria-busy="true">
        <div className="conta-skeleton-shimmer h-28 rounded-xl" />
        <div className="conta-skeleton-shimmer h-48 rounded-2xl" />
      </div>
    );
  }

  if (loadError && !order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-10">
        <Link
          href={ROUTES.accountPedidos}
          className="inline-flex text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          ← Voltar aos pedidos
        </Link>
        <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (loadError && order) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-10">
        <Link
          href={contaPedidoModelagemPath(order.id)}
          className="inline-flex text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          ← Voltar ao design
        </Link>
        <p className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <section
        className="conta-animate-fade-up relative mb-5 overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-4 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.2)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 sm:px-6 sm:py-5"
        style={{ "--conta-delay": "0ms" } as CSSProperties}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={
                order
                  ? contaPedidoModelagemPath(order.id)
                  : ROUTES.accountPedidos
              }
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 transition hover:text-amber-600 dark:text-amber-400/90"
            >
              ← Voltar ao design
            </Link>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
              Passo 1 · Artigos
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              Escolhe os artigos
            </h1>
            <p className="mt-1.5 max-w-md text-[12px] leading-snug text-zinc-600 dark:text-zinc-400 sm:text-[13px]">
              Pedido{" "}
              <span className="font-mono font-semibold">{order?.orderNumber}</span>
              {" — "}
              acrescenta ou altera peças. Ao continuar, o rascunho é actualizado
              (não cria um pedido novo).
            </p>
          </div>
          <div className="hidden shrink-0 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1 text-[10px] font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 sm:block">
            Passo 1 · Escolher artigos
          </div>
        </div>
        <OrderCreationWizard activeStep={1} className="relative mt-4" />
      </section>

      <form id="editar-artigos-form" onSubmit={handleSubmit} className="space-y-4">
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

        {error ? (
          <div
            className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}
      </form>

      <div
        ref={stickyFooterRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/90 bg-white/95 px-4 py-3 shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.15)] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/95"
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
                ? `${totalPieces} artigo${totalPieces !== 1 ? "s" : ""}`
                : "Sem artigos seleccionados"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {order ? (
              <Link
                href={contaPedidoModelagemPath(order.id)}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-300/80 bg-white/60 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:text-zinc-300 dark:hover:bg-zinc-900 sm:flex-none"
              >
                Voltar ao design
              </Link>
            ) : null}
            <button
              type="submit"
              form="editar-artigos-form"
              disabled={loading || !orderCatalogActive || !hasAnyArtigos}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
            >
              {loading ? "A guardar…" : "Guardar e continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
