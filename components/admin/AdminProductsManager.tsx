"use client";

/* eslint-disable react-hooks/set-state-in-effect -- formulários admin: alinhar estado a product.id / variantes e opções derivadas */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  createAdminProduct,
  createAdminProductVariant,
  deleteAdminProduct,
  deleteAdminProductVariant,
  getAdminProduct,
  listAdminCatalogTemplates,
  listAdminProducts,
  saveAdminCatalogTemplates,
  updateAdminProduct,
  updateAdminProductVariant,
  type AdminProduct,
  type AdminProductsCatalogStats,
  type CatalogFamily,
  type CreateAdminProductVariantBody,
} from "@/lib/api-client";
import {
  buildColorPricesPayloadFromForm,
  colorPricesMissingForMatrix,
  parseProductColorPrices,
  resolveColorUnitPrice,
  seedRowsByAdultBrandFromProduct,
  type ColorPriceFormRow,
  uniformColorPricesForGarment,
} from "@/lib/product-color-prices";
import {
  MONEY_DECIMAL_PLACES,
  sanitizeUnsignedDecimalString,
} from "@/lib/numeric-input";
import { useAnimatedConfirm } from "@/components/providers/AnimatedConfirmProvider";
import { loadSession } from "@/lib/auth-session";
import { formatMoney } from "@/lib/format-money";
import {
  APPAREL_COLORS,
  APPAREL_COLOR_PREVIEW_HEX,
  APPAREL_PRODUCT_TYPES,
  ADULT_SIZES,
  CHILD_SIZES,
  type ApparelAgeBand,
  type ApparelBrandId,
  allowedAgeBands,
  allowedBrands,
  allowedProcessesForColor,
  allowedSizes,
  buildAdminVariantSku,
  productSkuPrefix,
  buildApparelCatalogVariantMatrix,
  colorRequiresDtfOnly,
  defaultProductionProcessForCatalogColor,
  effectiveVariantProductionProcess,
  type ApparelCatalogVariantRow,
  type ApparelColorId,
  type ApparelProductType,
  type ProductionProcess,
  sizesMatchForCatalog,
  variantAgeBandMatchesSelection,
  variantBrandMatchesSelection,
} from "@/lib/apparel-catalog";
import { bulkCreateVariantsForProduct } from "@/lib/admin-products-variant-bulk";
import { bulkCreateNonApparelVariantsForProduct } from "@/lib/admin-products-non-apparel-bulk";
import { bulkCreateAreaVariantsForProduct } from "@/lib/admin-products-area-bulk";
import {
  areaVariantMatrixForCode,
  isAreaPricedProduct,
  supportsAreaVariantMatrix,
} from "@/lib/area-pricing-catalog";
import {
  nonApparelVariantMatrixForCode,
  supportsNonApparelMatrix,
} from "@/lib/non-apparel-catalog";
import {
  activeCatalogTemplates,
  catalogFamilyShortLabel,
  CATALOG_FAMILIES,
  DEFAULT_PRODUCT_CATALOG_TEMPLATES,
  familyConfigFromTemplate,
  mergeWithDefaultCatalogTemplates,
  isReservedTemplateCode,
  isVestuarioProduct,
  productAccent,
  resolveGarmentType,
  resolveProductCatalogFamily,
  nonApparelCatalogTemplates,
  areaCatalogTemplates,
  vestuarioCatalogTemplates,
  type ProductCatalogTemplate,
} from "@/lib/product-catalog";
import { AdminCatalogTemplatesModal } from "@/components/admin/AdminCatalogTemplatesModal";

const CUSTOM = "__custom__";

const SIZE_OPTIONS = [
  ...new Set([...ADULT_SIZES, ...CHILD_SIZES, "Único"]),
] as string[];

function garmentTypeShortLabel(
  product: AdminProduct,
  templates: ProductCatalogTemplate[],
): string {
  const id = resolveGarmentType(product, templates);
  return APPAREL_PRODUCT_TYPES.find((t) => t.id === id)?.label ?? id;
}

/** Coluna da matriz: tamanho + faixa + marca (infantil usa marca derivada do adulto). */
type MatrixColumnSpec = {
  size: string;
  ageBand: ApparelAgeBand;
  brandId: ApparelBrandId;
};

function matrixChildBrandIfAny(
  garmentType: ApparelProductType,
  adultBrandId: ApparelBrandId,
): ApparelBrandId | null {
  if (
    (garmentType === "T_SHIRT" ||
      garmentType === "PERSONALIZADO" ||
      garmentType === "EQUIPAMENTOS") &&
    adultBrandId === "BUK_MAX_PESADA"
  ) {
    return "BUK_MAX_PESADA";
  }
  if (garmentType === "POLO" && adultBrandId === "POLO_LACOST_PESADA") {
    return "POLO_LACOST_PESADA_CHILD";
  }
  if (garmentType === "POLO" && adultBrandId === "POLO_LACOST_LEVE") {
    return "POLO_LACOST_LEVE_CHILD";
  }
  return null;
}

function buildMatrixColumnSpecs(
  garmentType: ApparelProductType,
  adultBrandId: ApparelBrandId,
): MatrixColumnSpec[] {
  const cols: MatrixColumnSpec[] = allowedSizes(garmentType, "ADULT").map(
    (size) => ({
      size,
      ageBand: "ADULT" as const,
      brandId: adultBrandId,
    }),
  );
  const childBrand = matrixChildBrandIfAny(garmentType, adultBrandId);
  if (
    childBrand &&
    allowedAgeBands(garmentType).some((a) => a === "CHILD")
  ) {
    for (const size of allowedSizes(garmentType, "CHILD")) {
      cols.push({
        size,
        ageBand: "CHILD",
        brandId: childBrand,
      });
    }
  }
  return cols;
}

function slugSkuPart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 24);
}

const ADMIN_PRODUCTS_PAGE_SIZE = 50;

type AdminToast = { message: string; tone: "success" | "error" };

function AdminProductsToast({ toast }: { toast: AdminToast | null }) {
  if (!toast) return null;
  const ok = toast.tone === "success";
  return (
    <div
      className={`fixed bottom-6 right-6 z-[120] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md ${
        ok
          ? "border-emerald-400/35 bg-emerald-950/90 text-emerald-100 shadow-emerald-900/30"
          : "border-red-400/35 bg-red-950/90 text-red-100"
      }`}
      role="status"
    >
      {toast.message}
    </div>
  );
}

async function fetchAllAdminProducts(): Promise<AdminProduct[]> {
  const take = 100;
  const acc: AdminProduct[] = [];
  let skip = 0;
  for (;;) {
    const res = await listAdminProducts({ take, skip });
    acc.push(...res.items);
    if (res.items.length === 0 || acc.length >= res.total) break;
    skip += take;
  }
  return acc;
}

type CatalogLoadOverrides = {
  search?: string;
  pageIndex?: number;
  status?: "" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  catalogLine?: "" | "APPAREL" | "GENERIC";
  catalogFamily?: "" | CatalogFamily;
};

const selectClass =
  "w-full appearance-none rounded-xl border border-white/[0.08] bg-zinc-900/90 bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3.5 py-2.5 pr-10 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15";

const selectChevronStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
} as const;

type WorkspaceTab = "matrix" | "prices" | "tools";

/** Actualiza ?p= na barra de endereço sem navegação Next (evita loop de GET). */
function syncProductUrlParam(productId: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const currentP = params.get("p")?.trim() || null;
  if (currentP === productId) return;
  if (productId) params.set("p", productId);
  else params.delete("p");
  const qs = params.toString();
  const next = qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
  window.history.replaceState(null, "", next);
}

export function AdminProductsManager() {
  const isAdmin = loadSession()?.user.role === "ADMIN";
  const confirmAction = useAnimatedConfirm();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("p")?.trim() || null;

  const [toast, setToast] = useState<AdminToast | null>(null);
  const pushSuccess = useCallback((message: string) => {
    setToast({ message, tone: "success" });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [items, setItems] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [catalogStats, setCatalogStats] =
    useState<AdminProductsCatalogStats | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialProductId,
  );
  const [detailOverride, setDetailOverride] = useState<AdminProduct | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("matrix");
  const [productQuery, setProductQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
  >("");
  const [filterCatalogLine, setFilterCatalogLine] = useState<
    "" | "APPAREL" | "GENERIC"
  >("");
  const [filterCatalogFamily, setFilterCatalogFamily] = useState<
    "" | CatalogFamily
  >("");
  const [catalogTemplates, setCatalogTemplates] = useState<
    ProductCatalogTemplate[]
  >(DEFAULT_PRODUCT_CATALOG_TEMPLATES);
  const [modalTemplates, setModalTemplates] = useState(false);
  const [modalProduct, setModalProduct] = useState<"new" | null>(null);
  const [modalVariant, setModalVariant] = useState<{
    productId: string;
    variantId?: string;
  } | null>(null);
  const [modalBulkFull, setModalBulkFull] = useState(false);
  const [modalEditProductId, setModalEditProductId] = useState<string | null>(
    null,
  );
  const [variantModalFetched, setVariantModalFetched] =
    useState<AdminProduct | null>(null);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedQuery(productQuery.trim()),
      320,
    );
    return () => window.clearTimeout(t);
  }, [productQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, filterStatus, filterCatalogLine, filterCatalogFamily]);

  useEffect(() => {
    void listAdminCatalogTemplates()
      .then((t) => setCatalogTemplates(mergeWithDefaultCatalogTemplates(t)))
      .catch(() => {
        /* defaults locais */
      });
  }, []);

  useEffect(() => {
    syncProductUrlParam(selectedProductId);
  }, [selectedProductId]);

  useEffect(() => {
    const onPopState = () => {
      const p =
        new URLSearchParams(window.location.search).get("p")?.trim() || null;
      setSelectedProductId(p);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const load = useCallback(async (opts?: CatalogLoadOverrides) => {
    setErr(null);
    setLoading(true);
    try {
      const q =
        opts?.search !== undefined ? opts.search : debouncedQuery;
      const pageIdx = opts?.pageIndex !== undefined ? opts.pageIndex : page;
      const status =
        opts?.status !== undefined ? opts.status : filterStatus;
      const catalogLine =
        opts?.catalogLine !== undefined ? opts.catalogLine : filterCatalogLine;
      const catalogFamily =
        opts?.catalogFamily !== undefined
          ? opts.catalogFamily
          : filterCatalogFamily;
      const skip = pageIdx * ADMIN_PRODUCTS_PAGE_SIZE;
      const data = await listAdminProducts({
        q: q.trim() || undefined,
        take: ADMIN_PRODUCTS_PAGE_SIZE,
        skip,
        status: status || undefined,
        catalogLine: catalogFamily ? undefined : catalogLine || undefined,
        catalogFamily: catalogFamily || undefined,
      });
      setTotal(data.total);
      setCatalogStats(data.catalogStats);
      const lastPage = Math.max(
        0,
        Math.ceil(data.total / ADMIN_PRODUCTS_PAGE_SIZE) - 1,
      );
      if (data.total > 0 && pageIdx > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(data.items);
      if (opts?.pageIndex !== undefined) {
        setPage(Math.min(pageIdx, lastPage));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page, filterStatus, filterCatalogLine, filterCatalogFamily]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!catalogStats) {
      return {
        variantCountAll: 0,
        activeProducts: 0,
        activeVariantsInCatalog: 0,
      };
    }
    return catalogStats;
  }, [catalogStats]);

  const maxPage = useMemo(
    () => Math.max(0, Math.ceil(total / ADMIN_PRODUCTS_PAGE_SIZE) - 1),
    [total],
  );

  useEffect(() => {
    if (loading) return;
    if (total === 0) {
      setSelectedProductId(null);
      return;
    }
    setSelectedProductId((cur) => {
      if (cur) return cur;
      return items[0]?.id ?? null;
    });
  }, [total, items, loading]);

  const productFromList = useMemo(
    () => items.find((p) => p.id === selectedProductId) ?? null,
    [items, selectedProductId],
  );

  useEffect(() => {
    if (!selectedProductId) {
      setDetailOverride(null);
      setDetailLoading(false);
      return;
    }
    if (productFromList) {
      setDetailOverride(null);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void getAdminProduct(selectedProductId)
      .then((p) => {
        if (!cancelled) {
          setDetailOverride(p);
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailOverride(null);
          setDetailLoading(false);
          setSelectedProductId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProductId, productFromList]);

  const selectedProduct = productFromList ?? detailOverride;

  const variantModalProduct = useMemo(() => {
    if (!modalVariant) return null;
    if (selectedProduct?.id === modalVariant.productId) return selectedProduct;
    return items.find((p) => p.id === modalVariant.productId) ?? null;
  }, [modalVariant, selectedProduct, items]);

  useEffect(() => {
    if (!modalVariant) {
      setVariantModalFetched(null);
      return;
    }
    if (variantModalProduct) {
      setVariantModalFetched(null);
      return;
    }
    let cancelled = false;
    void getAdminProduct(modalVariant.productId).then((p) => {
      if (!cancelled) setVariantModalFetched(p);
    });
    return () => {
      cancelled = true;
    };
  }, [modalVariant, variantModalProduct]);

  const productForVariantModal = variantModalProduct ?? variantModalFetched;

  const deleteProductFlow = useCallback(async () => {
    const p = selectedProduct;
    if (!p) return;
    const ok = await confirmAction({
      title: "Eliminar produto",
      message: `Eliminar «${p.name}» (${p.code}) e todas as variantes associadas?`,
      destructive: true,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAdminProduct(p.id);
      pushSuccess("Produto eliminado.");
      setSelectedProductId(null);
      await load();
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Não foi possível eliminar o produto.",
      );
    } finally {
      setSaving(false);
    }
  }, [selectedProduct, load, confirmAction, pushSuccess]);

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        Apenas administradores podem gerir produtos.
      </div>
    );
  }

  return (
    <div className="relative min-h-full overflow-x-hidden p-4 sm:p-6 lg:p-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
      </div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
            Dádiva · Admin
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">
            Produtos & variantes
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-medium text-zinc-300">
              {debouncedQuery
                ? `${total} resultado${total === 1 ? "" : "s"}`
                : `${total} linha${total === 1 ? "" : "s"}`}
            </span>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-medium text-zinc-300">
              {stats.variantCountAll} SKU (total)
            </span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200/90">
              {stats.activeVariantsInCatalog} à venda
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2 text-xs font-medium text-zinc-200 backdrop-blur-sm hover:border-amber-400/30"
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => setModalProduct("new")}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-xs font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:from-amber-300 hover:to-amber-400"
          >
            + Linha nova
          </button>
          <button
            type="button"
            onClick={() => setModalTemplates(true)}
            className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-100 backdrop-blur-sm hover:bg-violet-500/20"
          >
            Modelos
          </button>
          <button
            type="button"
            onClick={() => setModalBulkFull(true)}
            className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-100 backdrop-blur-sm hover:bg-violet-500/20"
          >
            Instalar vestuário
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-100">
          {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          A carregar…
        </div>
      ) : !debouncedQuery &&
        filterStatus === "" &&
        filterCatalogFamily === "" &&
        filterCatalogLine === "" &&
        total === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 px-8 py-14 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Ainda não há produtos.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Usa <strong className="text-violet-300">Instalar catálogo completo</strong>{" "}
            ou <strong className="text-amber-300">+ Novo produto</strong>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <aside className="flex w-full flex-col rounded-2xl border border-white/[0.08] bg-zinc-900/40 shadow-xl shadow-black/20 backdrop-blur-md lg:max-w-sm lg:shrink-0">
            <div className="space-y-3 border-b border-white/[0.06] p-3">
              <div className="relative">
                <label className="sr-only" htmlFor="catalog-search">
                  Pesquisar produto
                </label>
                <input
                  id="catalog-search"
                  type="search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Nome ou código…"
                  className="w-full rounded-xl border border-white/10 bg-black/35 py-2.5 pl-3 pr-9 text-sm text-white placeholder:text-zinc-600 focus:border-amber-400/40 focus:outline-none focus:ring-1 focus:ring-amber-400/20"
                  autoComplete="off"
                />
                {productQuery ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-0.5 text-base leading-none text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                    aria-label="Limpar pesquisa"
                    onClick={() => setProductQuery("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-2">
                <div className="min-w-0">
                  <label
                    htmlFor="catalog-filter-status"
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                  >
                    Estado
                  </label>
                  <select
                    id="catalog-filter-status"
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(
                        e.target.value as
                          | ""
                          | "ACTIVE"
                          | "INACTIVE"
                          | "ARCHIVED",
                      )
                    }
                    className={selectClass}
                    style={selectChevronStyle}
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="ARCHIVED">Arquivado</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="catalog-filter-family"
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                  >
                    Família
                  </label>
                  <select
                    id="catalog-filter-family"
                    value={filterCatalogFamily}
                    onChange={(e) => {
                      setFilterCatalogFamily(
                        e.target.value as "" | CatalogFamily,
                      );
                      if (e.target.value) setFilterCatalogLine("");
                    }}
                    className={selectClass}
                    style={selectChevronStyle}
                  >
                    <option value="">Todas</option>
                    {CATALOG_FAMILIES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2 lg:max-h-[calc(100vh-12rem)]">
              {!loading && items.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-zinc-500">
                  {debouncedQuery
                    ? "Nenhum produto corresponde à pesquisa."
                    : filterStatus !== "" ||
                        filterCatalogLine !== "" ||
                        filterCatalogFamily !== ""
                      ? "Nenhum produto corresponde aos filtros."
                      : "Sem produtos nesta página."}
                </li>
              ) : null}
              {items.map((p) => {
                const activeCount = p.variants.filter((v) => v.active).length;
                const isSel = p.id === selectedProductId;
                const vestuario = isVestuarioProduct(p, catalogTemplates);
                const family = resolveProductCatalogFamily(p, catalogTemplates);
                const accent = productAccent(p, catalogTemplates);
                const pct =
                  p.variants.length === 0
                    ? 0
                    : Math.round((activeCount / p.variants.length) * 100);
                return (
                  <li key={p.id} className="mb-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setWorkspaceTab("matrix");
                      }}
                      className={`relative flex w-full gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition ${
                        isSel
                          ? "bg-white/[0.07] ring-2 ring-amber-400/45"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b ${accent}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-white">
                            {p.name}
                          </span>
                          {p.status !== "ACTIVE" ? (
                            <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase text-amber-200/90">
                              {p.status}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate font-mono text-[10px] text-zinc-500">
                          {p.code}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                            {vestuario
                              ? garmentTypeShortLabel(p, catalogTemplates)
                              : catalogFamilyShortLabel(family)}
                          </span>
                          <div className="h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-[10px] text-zinc-500">
                            {activeCount}/{p.variants.length}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto flex flex-shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] p-3">
              <button
                type="button"
                disabled={page <= 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-[11px] text-zinc-500">
                Página{" "}
                <span className="tabular-nums text-zinc-300">
                  {total === 0 ? 0 : page + 1}
                </span>{" "}
                /{" "}
                <span className="tabular-nums text-zinc-300">
                  {total === 0 ? 0 : maxPage + 1}
                </span>
              </span>
              <button
                type="button"
                disabled={page >= maxPage || loading || total === 0}
                onClick={() =>
                  setPage((p) => (p >= maxPage ? p : p + 1))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-zinc-300 disabled:opacity-40"
              >
                Seguinte
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/80 via-zinc-950/90 to-zinc-900/70 shadow-xl shadow-black/25 backdrop-blur-md">
            {detailLoading ? (
              <div className="flex items-center justify-center gap-3 p-12 text-sm text-zinc-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
                A carregar produto…
              </div>
            ) : selectedProduct ? (
              <ProductWorkspace
                product={selectedProduct}
                catalogTemplates={catalogTemplates}
                workspaceTab={workspaceTab}
                onTabChange={setWorkspaceTab}
                saving={saving}
                notifySuccess={pushSuccess}
                onEditProduct={() => setModalEditProductId(selectedProduct.id)}
                onAddVariant={() =>
                  setModalVariant({ productId: selectedProduct.id })
                }
                onEditVariant={(variantId) =>
                  setModalVariant({
                    productId: selectedProduct.id,
                    variantId,
                  })
                }
                onSaved={load}
                onBulkComplete={async (opts) => {
                  setSaving(true);
                  setErr(null);
                  try {
                    const table = parseProductColorPrices(
                      selectedProduct.colorPrices,
                    );
                    const miss = colorPricesMissingForMatrix(
                      table,
                      opts.garmentType,
                      opts.includeChildSizes,
                    );
                    if (miss) {
                      setErr(miss);
                      return;
                    }
                    const existingSkus = new Set(
                      selectedProduct.variants.map((v) => v.sku),
                    );
                    const result = await bulkCreateVariantsForProduct(
                      selectedProduct.id,
                      selectedProduct.code,
                      opts.garmentType,
                      {
                        includeChildSizes: opts.includeChildSizes,
                        colorPrices: table,
                        existingSkus,
                      },
                    );
                    if (result.errors.length > 0) {
                      setErr(
                        `Criadas ${result.created}, ignoradas ${result.skipped}. Ex.: ${result.errors.slice(0, 2).join(" · ")}`,
                      );
                    }
                    await load();
                    if (result.errors.length === 0) {
                      pushSuccess(`+${result.created} variantes criadas.`);
                    }
                  } catch (e) {
                    setErr(
                      e instanceof Error
                        ? e.message
                        : "Geração em massa falhou.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                onDeleteProduct={() => void deleteProductFlow()}
                setErr={setErr}
              />
            ) : debouncedQuery && total === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Nenhum produto corresponde à pesquisa.
              </p>
            ) : (
              <p className="p-8 text-center text-sm text-zinc-500">
                Selecciona um produto na lista.
              </p>
            )}
          </main>
        </div>
      )}

      {modalProduct === "new" ? (
        <ModalNewProduct
          templates={activeCatalogTemplates(catalogTemplates)}
          saving={saving}
          onClose={() => setModalProduct(null)}
          onCreate={async (body) => {
            setSaving(true);
            try {
              const { id } = await createAdminProduct(body);
              setModalProduct(null);
              setProductQuery("");
              setDebouncedQuery("");
              setPage(0);
              setSelectedProductId(id);
              await load({ search: "", pageIndex: 0 });
              pushSuccess("Produto criado.");
            } catch (e) {
              setErr(
                e instanceof Error ? e.message : "Não foi possível criar.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {modalTemplates ? (
        <AdminCatalogTemplatesModal
          templates={catalogTemplates}
          saving={saving}
          onClose={() => setModalTemplates(false)}
          onSave={async (next) => {
            setSaving(true);
            setErr(null);
            try {
              const saved = await saveAdminCatalogTemplates(next);
              setCatalogTemplates(saved);
              setModalTemplates(false);
              pushSuccess("Modelos actualizados.");
            } catch (e) {
              setErr(
                e instanceof Error ? e.message : "Não foi possível guardar modelos.",
              );
              throw e;
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {modalVariant ? (
        productForVariantModal ? (
          <ModalVariant
            key={`${modalVariant.productId}-${modalVariant.variantId ?? "new"}`}
            product={productForVariantModal}
            variantId={modalVariant.variantId}
            saving={saving}
            onClose={() => setModalVariant(null)}
            onSave={async (body) => {
              setSaving(true);
              try {
                if (modalVariant.variantId) {
                  await updateAdminProductVariant(
                    modalVariant.productId,
                    modalVariant.variantId,
                    body,
                  );
                } else {
                  await createAdminProductVariant(modalVariant.productId, body);
                }
                setModalVariant(null);
                await load();
                pushSuccess(
                  modalVariant.variantId
                    ? "Variante actualizada."
                    : "Variante criada.",
                );
              } catch (e) {
                setErr(
                  e instanceof Error ? e.message : "Não foi possível gravar.",
                );
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 text-sm text-zinc-400 backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              A carregar produto…
            </span>
          </div>
        )
      ) : null}

      {modalBulkFull ? (
        <ModalBulkFullCatalog
          templates={vestuarioCatalogTemplates(catalogTemplates)}
          saving={saving}
          onClose={() => setModalBulkFull(false)}
          onComplete={async (opts) => {
            setSaving(true);
            setErr(null);
            try {
              const apparelTemplates = vestuarioCatalogTemplates(catalogTemplates);
              let current = await fetchAllAdminProducts();
              for (const t of apparelTemplates) {
                if (!current.some((p) => p.code === t.code)) {
                  try {
                    await createAdminProduct({
                      code: t.code,
                      name: t.name,
                      catalogFamily: "VESTUARIO",
                      familyConfig: familyConfigFromTemplate(t),
                      status: "ACTIVE",
                    });
                  } catch {
                    /* código já existe */
                  }
                  current = await fetchAllAdminProducts();
                }
              }
              for (const t of apparelTemplates) {
                const prod = current.find((p) => p.code === t.code);
                if (!prod || !t.garmentType) continue;
                const includeChild =
                  t.garmentType !== "COLETE" &&
                  t.garmentType !== "BONE" &&
                  opts.includeChildSizes;
                const uniform = uniformColorPricesForGarment(
                  opts.defaultAdultPrice,
                  includeChild ? opts.defaultChildPrice : undefined,
                  t.garmentType,
                );
                await updateAdminProduct(prod.id, { colorPrices: uniform });
              }
              current = await fetchAllAdminProducts();
              const allErrors: string[] = [];
              let totalCreated = 0;
              let totalSkipped = 0;
              for (const t of apparelTemplates) {
                const prod = current.find((p) => p.code === t.code);
                if (!prod || !t.garmentType) continue;
                const includeChild =
                  t.garmentType !== "COLETE" &&
                  t.garmentType !== "BONE" &&
                  opts.includeChildSizes;
                const existingSkus = new Set(prod.variants.map((v) => v.sku));
                const table = parseProductColorPrices(prod.colorPrices);
                const result = await bulkCreateVariantsForProduct(
                  prod.id,
                  prod.code,
                  t.garmentType,
                  {
                    includeChildSizes: includeChild,
                    colorPrices: table,
                    existingSkus,
                  },
                );
                totalCreated += result.created;
                totalSkipped += result.skipped;
                allErrors.push(...result.errors);
                current = await fetchAllAdminProducts();
              }
              const extraTemplates = nonApparelCatalogTemplates(catalogTemplates);
              for (const t of extraTemplates) {
                if (!current.some((p) => p.code === t.code)) {
                  try {
                    await createAdminProduct({
                      code: t.code,
                      name: t.name,
                      catalogFamily: t.catalogFamily,
                      familyConfig: familyConfigFromTemplate(t),
                      status: "ACTIVE",
                    });
                  } catch {
                    /* código já existe */
                  }
                  current = await fetchAllAdminProducts();
                }
              }
              for (const t of extraTemplates) {
                const prod = current.find((p) => p.code === t.code);
                if (!prod) continue;
                const existingSkus = new Set(prod.variants.map((v) => v.sku));
                const result = await bulkCreateNonApparelVariantsForProduct(
                  prod.id,
                  prod.code,
                  { existingSkus },
                );
                totalCreated += result.created;
                totalSkipped += result.skipped;
                allErrors.push(...result.errors);
                current = await fetchAllAdminProducts();
              }
              const areaTemplates = areaCatalogTemplates(catalogTemplates);
              for (const t of areaTemplates) {
                if (!current.some((p) => p.code === t.code)) {
                  try {
                    await createAdminProduct({
                      code: t.code,
                      name: t.name,
                      catalogFamily: t.catalogFamily,
                      familyConfig: familyConfigFromTemplate(t),
                      status: "ACTIVE",
                    });
                  } catch {
                    /* código já existe */
                  }
                  current = await fetchAllAdminProducts();
                }
              }
              for (const t of areaTemplates) {
                const prod = current.find((p) => p.code === t.code);
                if (!prod) continue;
                const existingSkus = new Set(prod.variants.map((v) => v.sku));
                const result = await bulkCreateAreaVariantsForProduct(
                  prod.id,
                  prod.code,
                  { existingSkus },
                );
                totalCreated += result.created;
                totalSkipped += result.skipped;
                allErrors.push(...result.errors);
                current = await fetchAllAdminProducts();
              }
              setModalBulkFull(false);
              await load();
              if (allErrors.length > 0) {
                setErr(
                  `Instalação concluída: +${totalCreated} variantes (${totalSkipped} SKU já existiam). Erros: ${allErrors.slice(0, 3).join(" · ")}`,
                );
              } else {
                pushSuccess(
                  `Catálogo instalado (+${totalCreated} variantes vestuário e extras).`,
                );
              }
            } catch (e) {
              setErr(
                e instanceof Error ? e.message : "Instalação do catálogo falhou.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      {modalEditProductId && selectedProduct?.id === modalEditProductId ? (
        <ModalEditProduct
          product={selectedProduct}
          saving={saving}
          onClose={() => setModalEditProductId(null)}
          onSave={async (body) => {
            setSaving(true);
            setErr(null);
            try {
              await updateAdminProduct(selectedProduct.id, body);
              setModalEditProductId(null);
              await load();
              pushSuccess("Produto actualizado.");
            } catch (e) {
              setErr(
                e instanceof Error ? e.message : "Não foi possível gravar.",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}

      <AdminProductsToast toast={toast} />
    </div>
  );
}

const EMPTY_COLOR_PRICE_FORM: ColorPriceFormRow = {
  subAdult: "",
  subChild: "",
  dtfAdult: "",
  dtfChild: "",
};

function ProductColorPricesEditor({
  product,
  catalogTemplates,
  saving,
  onSaved,
  setErr,
  notifySuccess,
}: {
  product: AdminProduct;
  catalogTemplates: ProductCatalogTemplate[];
  saving: boolean;
  onSaved: () => Promise<void>;
  setErr: (msg: string | null) => void;
  notifySuccess: (message: string) => void;
}) {
  const garmentType = useMemo(
    () => resolveGarmentType(product, catalogTemplates),
    [product, catalogTemplates],
  );
  const showChild = garmentType !== "COLETE" && garmentType !== "BONE";
  const adultBrandOptions = useMemo(
    () => allowedBrands(garmentType, "ADULT"),
    [garmentType],
  );

  const [brandId, setBrandId] = useState<ApparelBrandId>(
    () => adultBrandOptions[0]!.id,
  );
  const [rowsByBrand, setRowsByBrand] = useState(() =>
    seedRowsByAdultBrandFromProduct(garmentType, product.colorPrices),
  );
  const [bulkSubAdult, setBulkSubAdult] = useState("");
  const [bulkSubChild, setBulkSubChild] = useState("");
  const [bulkDtfAdult, setBulkDtfAdult] = useState("");
  const [bulkDtfChild, setBulkDtfChild] = useState("");

  useEffect(() => {
    setBrandId((cur) =>
      adultBrandOptions.some((b) => b.id === cur)
        ? cur
        : adultBrandOptions[0]!.id,
    );
  }, [adultBrandOptions]);

  useEffect(() => {
    setRowsByBrand(
      seedRowsByAdultBrandFromProduct(garmentType, product.colorPrices),
    );
  }, [product.id, product.colorPrices, garmentType]);

  const modelLabel =
    adultBrandOptions.find((b) => b.id === brandId)?.label ?? "";

  async function save() {
    setErr(null);
    try {
      await updateAdminProduct(product.id, {
        colorPrices: buildColorPricesPayloadFromForm(
          adultBrandOptions,
          rowsByBrand,
          showChild,
        ),
      });
      await onSaved();
      notifySuccess("Preços guardados.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gravação falhou.");
    }
  }

  const rows = rowsByBrand[brandId] ?? {};

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Valores em{" "}
        <strong className="text-zinc-300">Kwanza (AOA)</strong> por cor,{" "}
        <strong className="text-zinc-400">modelo / grade</strong> e{" "}
        <strong className="text-zinc-400">processo</strong>{" "}
        (<strong className="text-emerald-300/90">Sublimação</strong> vs{" "}
        <strong className="text-violet-300/90">DTF</strong>). Se só preencheres
        um lado, o outro processo reutiliza o preço «geral» legado da mesma
        linha quando existir. Cores escuras no catálogo usam sobretudo DTF.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-zinc-500">
            Modelo / grade
          </span>
          <select
            className={`${selectClass} !min-w-[12rem]`}
            style={selectChevronStyle}
            value={brandId}
            onChange={(e) =>
              setBrandId(e.target.value as ApparelBrandId)
            }
          >
            {adultBrandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <span className="max-w-md text-[10px] text-zinc-600">
            Preços abaixo para{" "}
            <strong className="text-zinc-500">{modelLabel}</strong>.
            {showChild
              ? " Infantil aplica-se às variantes infantis desta linha."
              : null}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
        <span className="w-full text-[10px] font-semibold uppercase text-zinc-600">
          Aplicar a todas as cores (esta grade)
        </span>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-emerald-600/90">
            Sub · adulto
          </span>
          <input
            className="w-24 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
            value={bulkSubAdult}
            onChange={(e) =>
              setBulkSubAdult(
                sanitizeUnsignedDecimalString(
                  e.target.value,
                  MONEY_DECIMAL_PLACES,
                ),
              )
            }
            placeholder="Kz"
          />
        </label>
        {showChild ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-emerald-600/90">
              Sub · inf.
            </span>
            <input
              className="w-24 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              value={bulkSubChild}
              onChange={(e) =>
                setBulkSubChild(
                  sanitizeUnsignedDecimalString(
                    e.target.value,
                    MONEY_DECIMAL_PLACES,
                  ),
                )
              }
              placeholder="Kz"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-violet-400/90">
            DTF · adulto
          </span>
          <input
            className="w-24 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
            value={bulkDtfAdult}
            onChange={(e) =>
              setBulkDtfAdult(
                sanitizeUnsignedDecimalString(
                  e.target.value,
                  MONEY_DECIMAL_PLACES,
                ),
              )
            }
            placeholder="Kz"
          />
        </label>
        {showChild ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-violet-400/90">
              DTF · inf.
            </span>
            <input
              className="w-24 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              value={bulkDtfChild}
              onChange={(e) =>
                setBulkDtfChild(
                  sanitizeUnsignedDecimalString(
                    e.target.value,
                    MONEY_DECIMAL_PLACES,
                  ),
                )
              }
              placeholder="Kz"
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const subA = parseFloat(bulkSubAdult.replace(",", "."));
            const dtfA = parseFloat(bulkDtfAdult.replace(",", "."));
            const subC = parseFloat(bulkSubChild.replace(",", "."));
            const dtfC = parseFloat(bulkDtfChild.replace(",", "."));
            setRowsByBrand((prev) => {
              const next = { ...prev };
              const curBlock = { ...(next[brandId] ?? {}) };
              for (const c of APPAREL_COLORS) {
                const cur = curBlock[c.id] ?? { ...EMPTY_COLOR_PRICE_FORM };
                curBlock[c.id] = {
                  subAdult:
                    Number.isFinite(subA) && subA >= 0 ? String(subA) : cur.subAdult,
                  subChild:
                    showChild &&
                    Number.isFinite(subC) &&
                    subC >= 0
                      ? String(subC)
                      : cur.subChild,
                  dtfAdult:
                    Number.isFinite(dtfA) && dtfA >= 0 ? String(dtfA) : cur.dtfAdult,
                  dtfChild:
                    showChild &&
                    Number.isFinite(dtfC) &&
                    dtfC >= 0
                      ? String(dtfC)
                      : cur.dtfChild,
                };
              }
              next[brandId] = curBlock;
              return next;
            });
          }}
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
        >
          Aplicar à grelha
        </button>
      </div>

      <div className="max-h-[min(65vh,560px)] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-950/95">
            <tr>
              <th
                rowSpan={2}
                className="border border-white/10 px-2 py-2 text-left text-[10px] font-bold uppercase text-zinc-400"
              >
                Cor
              </th>
              <th
                colSpan={showChild ? 2 : 1}
                className="border border-white/10 px-2 py-1.5 text-center text-[10px] font-bold uppercase text-emerald-200/90"
              >
                Sublimação (Kz)
              </th>
              <th
                colSpan={showChild ? 2 : 1}
                className="border border-white/10 px-2 py-1.5 text-center text-[10px] font-bold uppercase text-violet-200/90"
              >
                DTF (Kz)
              </th>
            </tr>
            <tr>
              <th className="border border-white/10 px-1 py-1.5 text-center text-[9px] font-semibold text-emerald-200/70">
                Adulto
              </th>
              {showChild ? (
                <th className="border border-white/10 px-1 py-1.5 text-center text-[9px] font-semibold text-emerald-200/70">
                  Inf.
                </th>
              ) : null}
              <th className="border border-white/10 px-1 py-1.5 text-center text-[9px] font-semibold text-violet-200/70">
                Adulto
              </th>
              {showChild ? (
                <th className="border border-white/10 px-1 py-1.5 text-center text-[9px] font-semibold text-violet-200/70">
                  Inf.
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {APPAREL_COLORS.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="border border-white/10 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white/15"
                      style={{
                        backgroundColor: APPAREL_COLOR_PREVIEW_HEX[c.id],
                      }}
                    />
                    <span className="text-xs text-zinc-200">{c.label}</span>
                  </div>
                </td>
                <td className="border border-white/10 p-1">
                  <input
                    className="w-full min-w-[4rem] rounded-lg border border-white/10 bg-zinc-900/90 px-1.5 py-1 text-xs text-white"
                    inputMode="decimal"
                    value={rows[c.id]?.subAdult ?? ""}
                    onChange={(e) =>
                      setRowsByBrand((prev) => {
                        const block = { ...(prev[brandId] ?? {}) };
                        const cur = block[c.id] ?? { ...EMPTY_COLOR_PRICE_FORM };
                        block[c.id] = {
                          ...cur,
                          subAdult: sanitizeUnsignedDecimalString(
                            e.target.value,
                            MONEY_DECIMAL_PLACES,
                          ),
                        };
                        return { ...prev, [brandId]: block };
                      })
                    }
                  />
                </td>
                {showChild ? (
                  <td className="border border-white/10 p-1">
                    <input
                      className="w-full min-w-[4rem] rounded-lg border border-white/10 bg-zinc-900/90 px-1.5 py-1 text-xs text-white"
                      inputMode="decimal"
                      value={rows[c.id]?.subChild ?? ""}
                      onChange={(e) =>
                        setRowsByBrand((prev) => {
                          const block = { ...(prev[brandId] ?? {}) };
                          const cur = block[c.id] ?? { ...EMPTY_COLOR_PRICE_FORM };
                          block[c.id] = {
                            ...cur,
                            subChild: sanitizeUnsignedDecimalString(
                              e.target.value,
                              MONEY_DECIMAL_PLACES,
                            ),
                          };
                          return { ...prev, [brandId]: block };
                        })
                      }
                    />
                  </td>
                ) : null}
                <td className="border border-white/10 p-1">
                  <input
                    className="w-full min-w-[4rem] rounded-lg border border-white/10 bg-zinc-900/90 px-1.5 py-1 text-xs text-white"
                    inputMode="decimal"
                    value={rows[c.id]?.dtfAdult ?? ""}
                    onChange={(e) =>
                      setRowsByBrand((prev) => {
                        const block = { ...(prev[brandId] ?? {}) };
                        const cur = block[c.id] ?? { ...EMPTY_COLOR_PRICE_FORM };
                        block[c.id] = {
                          ...cur,
                          dtfAdult: sanitizeUnsignedDecimalString(
                            e.target.value,
                            MONEY_DECIMAL_PLACES,
                          ),
                        };
                        return { ...prev, [brandId]: block };
                      })
                    }
                  />
                </td>
                {showChild ? (
                  <td className="border border-white/10 p-1">
                    <input
                      className="w-full min-w-[4rem] rounded-lg border border-white/10 bg-zinc-900/90 px-1.5 py-1 text-xs text-white"
                      inputMode="decimal"
                      value={rows[c.id]?.dtfChild ?? ""}
                      onChange={(e) =>
                        setRowsByBrand((prev) => {
                          const block = { ...(prev[brandId] ?? {}) };
                          const cur = block[c.id] ?? { ...EMPTY_COLOR_PRICE_FORM };
                          block[c.id] = {
                            ...cur,
                            dtfChild: sanitizeUnsignedDecimalString(
                              e.target.value,
                              MONEY_DECIMAL_PLACES,
                            ),
                          };
                          return { ...prev, [brandId]: block };
                        })
                      }
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 disabled:opacity-40"
        >
          {saving ? "A guardar…" : "Guardar preços e actualizar variantes"}
        </button>
      </div>
    </div>
  );
}

function VariantSuperMatrixPanel({
  product,
  catalogTemplates,
  saving,
  onSaved,
  setErr,
}: {
  product: AdminProduct;
  catalogTemplates: ProductCatalogTemplate[];
  saving: boolean;
  onSaved: () => Promise<void>;
  setErr: (msg: string | null) => void;
}) {
  const garmentType = useMemo(
    () => resolveGarmentType(product, catalogTemplates),
    [product, catalogTemplates],
  );

  const adultBrandOptions = useMemo(
    () => allowedBrands(garmentType, "ADULT"),
    [garmentType],
  );

  const [brandId, setBrandId] = useState<ApparelBrandId>(
    () => adultBrandOptions[0]!.id,
  );

  useEffect(() => {
    const opts = allowedBrands(garmentType, "ADULT");
    setBrandId((cur) =>
      opts.some((b) => b.id === cur) ? cur : opts[0]!.id,
    );
  }, [garmentType]);

  const columnSpecs = useMemo(
    () => buildMatrixColumnSpecs(garmentType, brandId),
    [garmentType, brandId],
  );

  const adultColCount = useMemo(
    () => columnSpecs.filter((c) => c.ageBand === "ADULT").length,
    [columnSpecs],
  );
  const childColCount = columnSpecs.length - adultColCount;
  const showGroupedHeader = childColCount > 0;

  const matrixProcessRowCount = useMemo(
    () =>
      APPAREL_COLORS.reduce(
        (n, c) => n + allowedProcessesForColor(c.id).length,
        0,
      ),
    [],
  );

  const typeLabel =
    APPAREL_PRODUCT_TYPES.find((t) => t.id === garmentType)?.label ?? "";
  const modelLabel =
    adultBrandOptions.find((b) => b.id === brandId)?.label ?? "";

  const colorPriceTable = useMemo(
    () => parseProductColorPrices(product.colorPrices),
    [product.colorPrices],
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);

  function findMatrixVariantForProcess(
    colorId: ApparelColorId,
    col: MatrixColumnSpec,
    rowProcess: ProductionProcess,
  ) {
    const colorNorm = colorId.toLowerCase();
    return product.variants.find((v) => {
      const vc = (v.baseColor?.trim().toLowerCase() ?? "") || "";
      if (vc !== colorNorm) return false;
      if (!sizesMatchForCatalog(col.size, v.size ?? "")) return false;
      if ((v.garmentType?.trim() ?? "") !== garmentType) return false;
      if (
        effectiveVariantProductionProcess(v.productionProcess, colorId) !==
        rowProcess
      ) {
        return false;
      }
      const meta =
        v.metadata &&
        typeof v.metadata === "object" &&
        !Array.isArray(v.metadata)
          ? (v.metadata as Record<string, unknown>)
          : null;
      if (
        !variantBrandMatchesSelection(
          garmentType,
          col.brandId,
          meta?.brandId != null ? String(meta.brandId) : null,
        )
      ) {
        return false;
      }
      if (
        !variantAgeBandMatchesSelection(
          col.ageBand,
          col.size,
          meta?.ageBand != null ? String(meta.ageBand) : undefined,
        )
      ) {
        return false;
      }
      return true;
    });
  }

  async function setMatrixCellActive(
    colorId: ApparelColorId,
    col: MatrixColumnSpec,
    rowProcess: ProductionProcess,
    active: boolean,
  ) {
    const key = `${colorId}-${rowProcess}-${col.ageBand}-${col.size}`;
    setBusyKey(key);
    setErr(null);
    try {
      const existing = findMatrixVariantForProcess(colorId, col, rowProcess);
      if (existing) {
        await updateAdminProductVariant(product.id, existing.id, { active });
      } else if (active) {
        const n = resolveColorUnitPrice(
          colorPriceTable,
          garmentType,
          colorId,
          col.ageBand,
          col.brandId,
          rowProcess,
        );
        if (n === null) {
          setErr(
            `Define o preço ${
              col.ageBand === "CHILD" ? "infantil" : "adulto"
            } (${rowProcess === "DTF" ? "DTF" : "Sublimação"}) para «${colorId}» nesta grade (${col.brandId}) no separador Preços.`,
          );
          return;
        }
        const row: ApparelCatalogVariantRow = {
          colorId,
          size: col.size,
          ageBand: col.ageBand,
          brandId: col.brandId,
          productionProcess: rowProcess,
        };
        const sku = buildAdminVariantSku(product.code, row);
        await createAdminProductVariant(product.id, {
          sku,
          size: col.size,
          baseColor: colorId,
          productionProcess: row.productionProcess,
          garmentType,
          unitPrice: n,
          currency: "AOA",
          active: true,
          metadata: { brandId: col.brandId, ageBand: col.ageBand },
        });
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operação falhou.");
    } finally {
      setBusyKey(null);
    }
  }

  async function activateMatrixColorRow(colorId: ApparelColorId) {
    setBusyKey(`row-${colorId}`);
    setErr(null);
    try {
      const processes = allowedProcessesForColor(colorId);
      for (const productionProcess of processes) {
        for (const col of columnSpecs) {
          const n = resolveColorUnitPrice(
            colorPriceTable,
            garmentType,
            colorId,
            col.ageBand,
            col.brandId,
            productionProcess,
          );
          if (n === null) {
            setErr(
              `Falta preço ${
                col.ageBand === "CHILD" ? "infantil" : "adulto"
              } (${productionProcess === "DTF" ? "DTF" : "Sublimação"}) para «${colorId}» · ${col.brandId} (separador Preços).`,
            );
            return;
          }
          const v = findMatrixVariantForProcess(colorId, col, productionProcess);
          if (v) {
            if (!v.active) {
              await updateAdminProductVariant(product.id, v.id, {
                active: true,
              });
            }
          } else {
            const row: ApparelCatalogVariantRow = {
              colorId,
              size: col.size,
              ageBand: col.ageBand,
              brandId: col.brandId,
              productionProcess,
            };
            const sku = buildAdminVariantSku(product.code, row);
            await createAdminProductVariant(product.id, {
              sku,
              size: col.size,
              baseColor: colorId,
              productionProcess,
              garmentType,
              unitPrice: n,
              currency: "AOA",
              active: true,
              metadata: { brandId: col.brandId, ageBand: col.ageBand },
            });
          }
        }
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operação falhou.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-emerald-500/20 border-l-[3px] border-l-emerald-500 bg-gradient-to-r from-emerald-500/[0.07] to-transparent px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400/90">
          Gestão de variantes
        </p>
        <h3 className="mt-1 text-base font-bold text-white sm:text-lg">
          Matriz de ativação
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          {product.name} · {typeLabel} — {modelLabel}
        </p>
        <p className="mt-2 text-[11px] text-zinc-500">
          Cada linha de cor pode ter <strong className="text-zinc-400">duas</strong>{" "}
          linhas na tabela quando a cor permite sublimação e DTF — activa cada
          processo em separado. Cores só DTF têm uma linha. O preço vem do
          separador <strong className="text-zinc-400">Preços</strong> para a
          combinação cor × processo × grade.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-3 sm:p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-zinc-500">
            Modelo / grade
          </span>
          <select
            className={`${selectClass} !min-w-[12rem]`}
            style={selectChevronStyle}
            value={brandId}
            onChange={(e) =>
              setBrandId(e.target.value as ApparelBrandId)
            }
          >
            {adultBrandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          {garmentType === "T_SHIRT" ||
          garmentType === "POLO" ||
          garmentType === "PERSONALIZADO" ||
          garmentType === "EQUIPAMENTOS" ? (
            <span className="max-w-xs text-[10px] text-zinc-600">
              {childColCount > 0
                ? garmentType === "POLO"
                  ? "Infantil: polo Lacost (pesada/leve alinhado ao adulto)."
                  : "Infantil: Buk Max (t-shirt / personalizado / equipamentos)."
                : garmentType === "POLO"
                  ? "Cada Lacost adulto (pesada ou leve) tem a coluna infantil correspondente."
                  : "Troca para Buk Max para ver tamanhos infantis."}
            </span>
          ) : null}
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
        <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
          {APPAREL_COLORS.length} cores · {matrixProcessRowCount} linhas (cor ×
          processo)
        </span>
        <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
          {columnSpecs.length}{" "}
          {columnSpecs.length === 1 ? "tamanho" : "tamanhos"} nesta vista
        </span>
      </div>

      <div className="max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-white/10 shadow-inner shadow-black/30">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-20 bg-zinc-950/98 backdrop-blur-sm">
            {showGroupedHeader ? (
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 min-w-[10rem] border border-white/10 bg-zinc-950 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-zinc-400"
                >
                  Cor
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-[10rem] z-30 w-[4.5rem] border border-white/10 bg-zinc-950 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-400"
                >
                  Proc.
                </th>
                <th
                  colSpan={adultColCount}
                  className="border border-white/10 bg-emerald-950/40 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-200/90"
                >
                  Tamanhos adulto
                </th>
                <th
                  colSpan={childColCount}
                  className="border border-white/10 bg-teal-950/35 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-teal-200/90"
                >
                  Tamanhos infantil
                </th>
                <th
                  rowSpan={2}
                  className="border border-white/10 bg-zinc-950 px-2 py-2 text-center text-[10px] font-semibold text-zinc-400"
                >
                  Tudo
                </th>
              </tr>
            ) : null}
            <tr>
              {!showGroupedHeader ? (
                <>
                  <th className="sticky left-0 z-30 border border-white/10 bg-zinc-950 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Cor
                  </th>
                  <th className="sticky left-[10rem] z-30 w-[4.5rem] border border-white/10 bg-zinc-950 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Proc.
                  </th>
                </>
              ) : null}
              {columnSpecs.map((col) => (
                <th
                  key={`${col.ageBand}-${col.size}`}
                  className={`border border-white/10 px-1 py-2 text-center text-[10px] font-semibold text-zinc-400 ${
                    col.ageBand === "CHILD"
                      ? "bg-teal-950/20"
                      : "bg-zinc-950/90"
                  }`}
                >
                  {col.size}
                </th>
              ))}
              {!showGroupedHeader ? (
                <th className="border border-white/10 px-2 py-2 text-[10px] font-semibold text-zinc-400">
                  Tudo
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {APPAREL_COLORS.flatMap((color) => {
              const rowBusy = busyKey === `row-${color.id}`;
              const processes = allowedProcessesForColor(color.id);
              return processes.map((rowProcess, procIdx) => (
                <tr
                  key={`${color.id}-${rowProcess}`}
                  className="transition-colors hover:bg-white/[0.03]"
                >
                  {procIdx === 0 ? (
                    <td
                      rowSpan={processes.length}
                      className="sticky left-0 z-10 border border-white/10 bg-zinc-900/98 px-2 py-1.5 align-top"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-7 w-7 shrink-0 rounded-full ring-2 ring-white/15"
                          style={{
                            backgroundColor:
                              APPAREL_COLOR_PREVIEW_HEX[color.id],
                          }}
                          title={color.label}
                        />
                        <span className="text-xs text-zinc-200">
                          {color.label}
                        </span>
                      </div>
                    </td>
                  ) : null}
                  <td
                    className={`sticky left-[10rem] z-10 border border-white/10 px-1 py-1.5 text-center align-middle ${
                      rowProcess === "DTF"
                        ? "bg-amber-950/25 text-[10px] font-bold text-amber-200/95"
                        : "bg-zinc-900/98 text-[10px] font-semibold text-zinc-300"
                    }`}
                  >
                    {rowProcess === "DTF" ? "DTF" : "Sub."}
                  </td>
                  {columnSpecs.map((col) => {
                    const v = findMatrixVariantForProcess(
                      color.id,
                      col,
                      rowProcess,
                    );
                    const key = `${color.id}-${rowProcess}-${col.ageBand}-${col.size}`;
                    const busy = busyKey === key;
                    const cellPrice = resolveColorUnitPrice(
                      colorPriceTable,
                      garmentType,
                      color.id,
                      col.ageBand,
                      col.brandId,
                      rowProcess,
                    );
                    const canCreate = !v && cellPrice !== null;
                    return (
                      <td
                        key={key}
                        className={`border border-white/10 p-1 text-center align-middle ${
                          col.ageBand === "CHILD" ? "bg-teal-950/10" : ""
                        }`}
                      >
                        <div className="flex flex-col items-center gap-0.5 py-0.5">
                          {cellPrice !== null ? (
                            <span className="text-[9px] font-semibold tabular-nums leading-none text-emerald-300/90">
                              {formatMoney(cellPrice, "AOA")}
                            </span>
                          ) : (
                            <span
                              className="text-[9px] leading-none text-amber-500/85"
                              title="Preço em falta — separador Preços"
                            >
                              —
                            </span>
                          )}
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-zinc-600 text-emerald-500 focus:ring-emerald-400/30"
                            checked={!!v?.active}
                            disabled={
                              saving ||
                              busy ||
                              rowBusy ||
                              (!v && !canCreate)
                            }
                            onChange={(e) =>
                              void setMatrixCellActive(
                                color.id,
                                col,
                                rowProcess,
                                e.target.checked,
                              )
                            }
                            title={
                              v
                                ? v.active
                                  ? "Visível no site — desmarca para ocultar"
                                  : "Inactiva — marca para publicar"
                                : canCreate
                                  ? "Criar SKU e activar"
                                  : `Preço ${
                                      col.ageBand === "CHILD"
                                        ? "infantil"
                                        : "adulto"
                                    } (${rowProcess === "DTF" ? "DTF" : "Sub."}) em Preços`
                            }
                            aria-label={`${color.label} ${rowProcess === "DTF" ? "DTF" : "Sublimação"} ${col.size} ${col.ageBand === "CHILD" ? "infantil" : "adulto"}`}
                          />
                        </div>
                      </td>
                    );
                  })}
                  {procIdx === 0 ? (
                    <td
                      rowSpan={processes.length}
                      className="border border-white/10 p-1 text-center align-middle"
                    >
                      <button
                        type="button"
                        disabled={saving || !!busyKey}
                        onClick={() => void activateMatrixColorRow(color.id)}
                        className="whitespace-nowrap rounded-lg border border-emerald-500/45 bg-emerald-500/12 px-2 py-1 text-[10px] font-bold text-emerald-100 hover:bg-emerald-500/22 disabled:opacity-40"
                      >
                        Activar tudo
                      </button>
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Lona / Vinil — preço por m²; dimensões no pedido. */
function AreaCatalogVariantsPanel({
  product,
  saving,
  onSaved,
  setErr,
  onAddVariant,
  onEditVariant,
}: {
  product: AdminProduct;
  saving: boolean;
  onSaved: () => Promise<void>;
  setErr: (msg: string | null) => void;
  onAddVariant: () => void;
  onEditVariant: (variantId: string) => void;
}) {
  const confirmAction = useAnimatedConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const matrixSupported = supportsAreaVariantMatrix(product.code);
  const matrixCount = useMemo(() => {
    const m = areaVariantMatrixForCode(product.code);
    return m?.length ?? 0;
  }, [product.code]);

  async function generateMatrix() {
    if (!matrixSupported) return;
    const ok = await confirmAction({
      title: "Gerar matriz de tipos",
      message: `Criar até ${matrixCount} variantes (preço/m²) para «${product.name}»? SKU já existentes serão ignorados.`,
      confirmLabel: "Gerar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBulkBusy(true);
    setErr(null);
    try {
      const existingSkus = new Set(product.variants.map((v) => v.sku));
      const res = await bulkCreateAreaVariantsForProduct(
        product.id,
        product.code,
        { existingSkus },
      );
      await onSaved();
      if (res.errors.length) {
        setErr(
          `Criadas ${res.created}, ignoradas ${res.skipped}. Avisos: ${res.errors.slice(0, 3).join(" · ")}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível gerar variantes.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleActive(variantId: string, active: boolean) {
    setBusyId(variantId);
    setErr(null);
    try {
      await updateAdminProductVariant(product.id, variantId, { active });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operação falhou.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeVariant(variantId: string, sku: string) {
    const ok = await confirmAction({
      title: "Eliminar variante",
      message: `Eliminar a variante «${sku}»?`,
      destructive: true,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBusyId(variantId);
    setErr(null);
    try {
      await deleteAdminProductVariant(product.id, variantId);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível eliminar.");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = useMemo(
    () => [...product.variants].sort((a, b) => a.sku.localeCompare(b.sku)),
    [product.variants],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-orange-500/25 border-l-[3px] border-l-orange-500 bg-gradient-to-r from-orange-500/[0.08] to-transparent px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-400/90">
          Lona / Vinil
        </p>
        <h3 className="mt-1 text-base font-bold text-white sm:text-lg">
          Tipos e preço por m² (AOA)
        </h3>
        <p className="mt-2 text-xs text-zinc-400">
          Cada variante define o <strong className="text-zinc-300">tipo ou acabamento</strong>{" "}
          e o <strong className="text-zinc-300">preço por metro quadrado</strong>.
          No pedido, o cliente indica altura e largura em metros; o total é calculado
          automaticamente.
          {matrixSupported ? (
            <>
              {" "}
              Podes gerar a matriz predefinida ({matrixCount} tipos) ou adicionar SKU
              manualmente.
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {matrixSupported ? (
          <button
            type="button"
            disabled={saving || bulkBusy}
            onClick={() => void generateMatrix()}
            className="rounded-xl border border-orange-400/35 bg-orange-400/10 px-4 py-2 text-xs font-bold text-orange-100 hover:bg-orange-400/18 disabled:opacity-40"
          >
            {bulkBusy ? "A gerar…" : `⚡ Gerar matriz (${matrixCount})`}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={onAddVariant}
          className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/18 disabled:opacity-40"
        >
          + Nova variante
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
          Ainda não há tipos. Gera a matriz ou adiciona a primeira variante com preço/m².
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-950/95 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="border-b border-white/10 px-3 py-2">SKU</th>
                <th className="border-b border-white/10 px-3 py-2">Tipo</th>
                <th className="border-b border-white/10 px-3 py-2 text-right">
                  Preço/m² (Kz)
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-center">
                  Activa
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-right">
                  Acções
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const busy = busyId === v.id;
                const label = v.size?.trim() || "—";
                return (
                  <tr
                    key={v.id}
                    className="border-b border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-zinc-200">
                      {v.sku}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-zinc-400">
                      {label}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-300">
                      {String(v.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-600 text-emerald-500"
                        checked={v.active}
                        disabled={saving || busy}
                        onChange={(e) =>
                          void toggleActive(v.id, e.target.checked)
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={() => onEditVariant(v.id)}
                        className="mr-2 text-[11px] font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-40"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={() => void removeVariant(v.id, v.sku)}
                        className="text-[11px] font-semibold text-red-400/90 hover:text-red-300 disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Catálogo genérico: só gestão de SKU / preço (equipamentos, consumíveis, etc.). */
function GenericCatalogVariantsPanel({
  product,
  saving,
  onSaved,
  setErr,
  onAddVariant,
  onEditVariant,
}: {
  product: AdminProduct;
  saving: boolean;
  onSaved: () => Promise<void>;
  setErr: (msg: string | null) => void;
  onAddVariant: () => void;
  onEditVariant: (variantId: string) => void;
}) {
  const confirmAction = useAnimatedConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const matrixSupported = supportsNonApparelMatrix(product.code);
  const matrixCount = useMemo(() => {
    const m = nonApparelVariantMatrixForCode(product.code);
    return m?.length ?? 0;
  }, [product.code]);

  async function generateMatrix() {
    if (!matrixSupported) return;
    const ok = await confirmAction({
      title: "Gerar matriz de variantes",
      message: `Criar até ${matrixCount} SKU automáticos para «${product.name}»? Variantes já existentes serão ignoradas.`,
      confirmLabel: "Gerar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBulkBusy(true);
    setErr(null);
    try {
      const existingSkus = new Set(product.variants.map((v) => v.sku));
      const res = await bulkCreateNonApparelVariantsForProduct(
        product.id,
        product.code,
        { existingSkus },
      );
      await onSaved();
      if (res.errors.length) {
        setErr(
          `Criadas ${res.created}, ignoradas ${res.skipped}. Avisos: ${res.errors.slice(0, 3).join(" · ")}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível gerar variantes.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleActive(variantId: string, active: boolean) {
    setBusyId(variantId);
    setErr(null);
    try {
      await updateAdminProductVariant(product.id, variantId, { active });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operação falhou.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeVariant(variantId: string, sku: string) {
    const ok = await confirmAction({
      title: "Eliminar variante",
      message: `Eliminar a variante «${sku}»?`,
      destructive: true,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBusyId(variantId);
    setErr(null);
    try {
      await deleteAdminProductVariant(product.id, variantId);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível eliminar.");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = useMemo(
    () => [...product.variants].sort((a, b) => a.sku.localeCompare(b.sku)),
    [product.variants],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-sky-500/25 border-l-[3px] border-l-sky-500 bg-gradient-to-r from-sky-500/[0.08] to-transparent px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400/90">
          Catálogo genérico
        </p>
        <h3 className="mt-1 text-base font-bold text-white sm:text-lg">
          Variantes e preços (AOA)
        </h3>
        <p className="mt-2 text-xs text-zinc-400">
          Cada linha é um SKU vendável. Usa{" "}
          <strong className="text-zinc-300">Descrição</strong> para distinguir
          formatos, acabamentos ou capacidades. Estes artigos aparecem no
          formulário «Novo pedido» na secção Canecas / impressão plana.
          {matrixSupported ? (
            <>
              {" "}
              Podes gerar a matriz predefinida ({matrixCount} variantes) ou
              adicionar SKU manualmente.
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {matrixSupported ? (
          <button
            type="button"
            disabled={saving || bulkBusy}
            onClick={() => void generateMatrix()}
            className="rounded-xl border border-violet-400/35 bg-violet-400/10 px-4 py-2 text-xs font-bold text-violet-100 hover:bg-violet-400/18 disabled:opacity-40"
          >
            {bulkBusy ? "A gerar…" : `⚡ Gerar matriz (${matrixCount})`}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={onAddVariant}
          className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/18 disabled:opacity-40"
        >
          + Nova variante
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
          Ainda não há SKU. Adiciona a primeira variante com código e preço.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-950/95 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="border-b border-white/10 px-3 py-2">SKU</th>
                <th className="border-b border-white/10 px-3 py-2">Descrição</th>
                <th className="border-b border-white/10 px-3 py-2 text-right">
                  Preço (Kz)
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-center">
                  Activa
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-right">
                  Acções
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const busy = busyId === v.id;
                const label =
                  [v.size?.trim(), v.baseColor?.trim()]
                    .filter(Boolean)
                    .join(" · ") || "—";
                return (
                  <tr
                    key={v.id}
                    className="border-b border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-zinc-200">
                      {v.sku}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-zinc-400">
                      {label}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-300">
                      {String(v.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-600 text-emerald-500"
                        checked={v.active}
                        disabled={saving || busy}
                        onChange={(e) =>
                          void toggleActive(v.id, e.target.checked)
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={() => onEditVariant(v.id)}
                        className="mr-2 text-[11px] font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-40"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={saving || busy}
                        onClick={() => void removeVariant(v.id, v.sku)}
                        className="text-[11px] font-semibold text-red-400/90 hover:text-red-300 disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductWorkspace({
  product,
  catalogTemplates,
  workspaceTab,
  onTabChange,
  saving,
  onAddVariant,
  onSaved,
  onBulkComplete,
  onDeleteProduct,
  setErr,
  onEditVariant,
  onEditProduct,
  notifySuccess,
}: {
  product: AdminProduct;
  catalogTemplates: ProductCatalogTemplate[];
  workspaceTab: WorkspaceTab;
  onTabChange: (t: WorkspaceTab) => void;
  saving: boolean;
  onAddVariant: () => void;
  onSaved: () => Promise<void>;
  onBulkComplete: (opts: {
    garmentType: ApparelProductType;
    includeChildSizes: boolean;
  }) => Promise<void>;
  onDeleteProduct: () => void;
  setErr: (msg: string | null) => void;
  onEditVariant: (variantId: string) => void;
  onEditProduct: () => void;
  notifySuccess: (message: string) => void;
}) {
  const isApparel = isVestuarioProduct(product, catalogTemplates);
  const gType = resolveGarmentType(product, catalogTemplates);
  const family = resolveProductCatalogFamily(product, catalogTemplates);
  const gAccent = productAccent(product, catalogTemplates);
  const isAreaProduct = isAreaPricedProduct(product);

  if (!isApparel) {
    return (
      <div className="overflow-hidden">
        <div className="relative border-b border-white/[0.07] p-4 sm:p-5">
          <div
            className={`pointer-events-none absolute inset-0 opacity-[0.12] bg-gradient-to-br ${gAccent}`}
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
                  {product.name}
                </h2>
                <span className="shrink-0 rounded-lg border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
                  {catalogFamilyShortLabel(family)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                {product.code}
              </p>
              {product.description?.trim() ? (
                <p className="mt-2 text-xs text-zinc-400">
                  {product.description.trim()}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onEditProduct}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
              >
                Editar
              </button>
              <ProductStatusSelect
                product={product}
                disabled={saving}
                onSaved={onSaved}
                notifySuccess={notifySuccess}
              />
              <button
                type="button"
                onClick={onDeleteProduct}
                disabled={saving}
                className="rounded-xl border border-red-500/35 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/55 disabled:opacity-40"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
        {isAreaProduct ? (
          <AreaCatalogVariantsPanel
            product={product}
            saving={saving}
            onSaved={onSaved}
            setErr={setErr}
            onAddVariant={onAddVariant}
            onEditVariant={onEditVariant}
          />
        ) : (
          <GenericCatalogVariantsPanel
            product={product}
            saving={saving}
            onSaved={onSaved}
            setErr={setErr}
            onAddVariant={onAddVariant}
            onEditVariant={onEditVariant}
          />
        )}
      </div>
    );
  }

  const tabs: {
    id: WorkspaceTab;
    title: string;
    hint: string;
    icon: string;
  }[] = [
    {
      id: "matrix",
      title: "Matriz",
      hint: "cor × tamanho",
      icon: "▦",
    },
    {
      id: "prices",
      title: "Preços",
      hint: "AOA por cor",
      icon: "Kz",
    },
    {
      id: "tools",
      title: "Gerar",
      hint: "em massa",
      icon: "⚡",
    },
  ];

  return (
    <div className="overflow-hidden">
      <div className="relative border-b border-white/[0.07] p-4 sm:p-5">
        <div
          className={`pointer-events-none absolute inset-0 opacity-[0.12] bg-gradient-to-br ${gAccent}`}
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
                {product.name}
              </h2>
              <span className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {garmentTypeShortLabel(product, catalogTemplates)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {product.code}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onEditProduct}
              disabled={saving}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/[0.06] disabled:opacity-40"
            >
              Editar
            </button>
            <ProductStatusSelect
              product={product}
              disabled={saving}
              onSaved={onSaved}
              notifySuccess={notifySuccess}
            />
            <button
              type="button"
              onClick={onAddVariant}
              disabled={saving}
              className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-400/18 disabled:opacity-40"
            >
              + Variante
            </button>
            <button
              type="button"
              onClick={onDeleteProduct}
              disabled={saving}
              className="rounded-xl border border-red-500/35 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-950/55 disabled:opacity-40"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.06] p-2 sm:p-3">
        <div
          className="flex gap-1 rounded-2xl border border-white/[0.06] bg-black/35 p-1 shadow-inner shadow-black/40"
          role="tablist"
          aria-label="Área de trabalho do produto"
        >
          {tabs.map((t) => {
            const on = workspaceTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTabChange(t.id)}
                className={`flex min-w-0 flex-1 items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition sm:px-3 ${
                  on
                    ? "bg-gradient-to-br from-amber-400/25 to-amber-600/10 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-400/30"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <span className="hidden text-base opacity-80 sm:inline" aria-hidden>
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold sm:text-sm">
                    {t.title}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[10px] sm:text-[11px] ${on ? "text-amber-100/70" : "text-zinc-600"}`}
                  >
                    {t.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[14rem]">
        {workspaceTab === "matrix" ? (
          <VariantSuperMatrixPanel
            product={product}
            catalogTemplates={catalogTemplates}
            saving={saving}
            onSaved={onSaved}
            setErr={setErr}
          />
        ) : null}

        {workspaceTab === "prices" ? (
          <ProductColorPricesEditor
            product={product}
            catalogTemplates={catalogTemplates}
            saving={saving}
            onSaved={onSaved}
            setErr={setErr}
            notifySuccess={notifySuccess}
          />
        ) : null}

        {workspaceTab === "tools" ? (
          <BulkGeneratePanel
            product={product}
            catalogTemplates={catalogTemplates}
            saving={saving}
            onComplete={onBulkComplete}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProductStatusSelect({
  product,
  disabled,
  onSaved,
  notifySuccess,
}: {
  product: AdminProduct;
  disabled: boolean;
  onSaved: () => void | Promise<void>;
  notifySuccess: (message: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-zinc-500">
      <span className="font-medium uppercase tracking-wide">Estado</span>
      <select
        className={`${selectClass} !w-auto min-w-[8.5rem] py-1.5 text-xs`}
        style={selectChevronStyle}
        disabled={disabled}
        value={product.status}
        onChange={async (e) => {
          const status = e.target.value as
            | "ACTIVE"
            | "INACTIVE"
            | "ARCHIVED";
          await updateAdminProduct(product.id, { status });
          await onSaved();
          notifySuccess("Estado actualizado.");
        }}
      >
        <option value="ACTIVE">Activo</option>
        <option value="INACTIVE">Inactivo</option>
        <option value="ARCHIVED">Arquivado</option>
      </select>
    </label>
  );
}

function ModalEditProduct({
  product,
  saving,
  onClose,
  onSave,
}: {
  product: AdminProduct;
  saving: boolean;
  onClose: () => void;
  onSave: (body: {
    name: string;
    description?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");

  useEffect(() => {
    setName(product.name);
    setDescription(product.description ?? "");
  }, [product.id, product.name, product.description]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/[0.1] bg-zinc-950/95 p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90">
              Editar produto
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">{product.code}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              O código não pode ser alterado (ligado aos SKUs).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Nome">
            <input
              className={selectClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Descrição (opcional)">
            <textarea
              className={`${selectClass} min-h-[88px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() =>
              void onSave({
                name: name.trim(),
                description: description.trim() || null,
              })
            }
            className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-45"
          >
            {saving ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalNewProduct({
  templates,
  saving,
  onClose,
  onCreate,
}: {
  templates: ProductCatalogTemplate[];
  saving: boolean;
  onClose: () => void;
  onCreate: (body: {
    code: string;
    name: string;
    description?: string;
    catalogFamily: CatalogFamily;
    familyConfig?: { garmentType?: ApparelProductType };
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [catalogFamily, setCatalogFamily] = useState<CatalogFamily>("GENERICO");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const templatesByFamily = useMemo(() => {
    const map = new Map<CatalogFamily, ProductCatalogTemplate[]>();
    for (const f of CATALOG_FAMILIES) map.set(f.id, []);
    for (const t of templates) {
      const list = map.get(t.catalogFamily) ?? [];
      list.push(t);
      map.set(t.catalogFamily, list);
    }
    return map;
  }, [templates]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  function applyTemplate(t: ProductCatalogTemplate) {
    setMode("template");
    setSelectedTemplateId(t.id);
    setCatalogFamily(t.catalogFamily);
    setCode(t.code);
    setName(t.name);
    setDescription(t.hint);
  }

  const codeConflict =
    mode === "custom" &&
    code.trim() &&
    isReservedTemplateCode(code.trim(), templates);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[0.1] bg-zinc-950/95 p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90">
              Novo
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">Criar produto</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-black/25 p-1">
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              mode === "template"
                ? "bg-amber-400/20 text-amber-100 ring-1 ring-amber-400/35"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            A partir de modelo
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("custom");
              setSelectedTemplateId(null);
              setCatalogFamily("GENERICO");
            }}
            className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              mode === "custom"
                ? "bg-sky-400/20 text-sky-100 ring-1 ring-sky-400/35"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Personalizado
          </button>
        </div>

        {mode === "template" ? (
          <div className="mt-4 space-y-4">
            {CATALOG_FAMILIES.filter(
              (f) => (templatesByFamily.get(f.id)?.length ?? 0) > 0,
            ).map((family) => (
              <section key={family.id}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                  {family.label}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(templatesByFamily.get(family.id) ?? []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        selectedTemplateId === t.id
                          ? "border-amber-400/50 bg-amber-400/10 ring-2 ring-amber-400/25"
                          : "border-white/[0.08] bg-zinc-900/50 hover:border-white/15"
                      }`}
                    >
                      <div
                        className={`mb-2 h-8 rounded-lg bg-gradient-to-br ${t.accent}`}
                      />
                      <p className="text-xs font-semibold text-white">{t.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                        {t.code}
                      </p>
                      {t.hint ? (
                        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                          {t.hint}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-[11px] font-semibold uppercase text-zinc-500">
              Família
              <select
                className={`${selectClass} mt-1`}
                style={selectChevronStyle}
                value={catalogFamily}
                onChange={(e) =>
                  setCatalogFamily(e.target.value as CatalogFamily)
                }
              >
                {CATALOG_FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-zinc-500">
              {CATALOG_FAMILIES.find((f) => f.id === catalogFamily)?.description}
            </p>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <Field label="Código interno (único)">
            <input
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 font-mono text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
              value={code}
              onChange={(e) => {
                setSelectedTemplateId(null);
                setCode(e.target.value.toUpperCase());
              }}
              placeholder="ex.: CANECA"
            />
          </Field>
          <Field label="Nome visível">
            <input
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
              value={name}
              onChange={(e) => {
                setSelectedTemplateId(null);
                setName(e.target.value);
              }}
            />
          </Field>
          <Field label="Descrição (opcional)">
            <textarea
              className="w-full resize-y rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <p className="order-2 text-center text-[11px] text-red-300/90 sm:order-1 sm:mr-auto sm:text-left">
            {codeConflict
              ? "Este código pertence a um modelo — escolhe o modelo ou usa outro código."
              : ""}
          </p>
          <div className="order-1 flex justify-end gap-2 sm:order-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                saving ||
                !code.trim() ||
                !name.trim() ||
                Boolean(codeConflict) ||
                (mode === "template" && !selectedTemplate)
              }
              onClick={() => {
                const family =
                  mode === "template" && selectedTemplate
                    ? selectedTemplate.catalogFamily
                    : catalogFamily;
                const familyConfig =
                  mode === "template" && selectedTemplate
                    ? familyConfigFromTemplate(selectedTemplate)
                    : undefined;
                void onCreate({
                  code: code.trim(),
                  name: name.trim(),
                  description: description.trim() || undefined,
                  catalogFamily: family,
                  familyConfig,
                });
              }}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 disabled:opacity-40"
            >
              Criar produto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function ModalVariant({
  product,
  variantId,
  saving,
  onClose,
  onSave,
}: {
  product: AdminProduct | undefined;
  variantId?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (body: CreateAdminProductVariantBody) => Promise<void>;
}) {
  const existing = product?.variants.find((v) => v.id === variantId);

  const initialColorSelect = useMemo(() => {
    const raw = existing?.baseColor?.trim() ?? "";
    if (!raw) return "";
    const match = APPAREL_COLORS.find((c) => c.id === raw);
    if (match) return match.id;
    return CUSTOM;
  }, [existing?.baseColor]);

  const initialSizeSelect = useMemo(() => {
    const raw = existing?.size?.trim() ?? "";
    if (!raw) return "";
    if (SIZE_OPTIONS.includes(raw)) return raw;
    return CUSTOM;
  }, [existing?.size]);

  const [sku, setSku] = useState(existing?.sku ?? "");
  const [colorSelect, setColorSelect] = useState(initialColorSelect);
  const [customColor, setCustomColor] = useState(() =>
    initialColorSelect === CUSTOM ? (existing?.baseColor ?? "") : "",
  );
  const [sizeSelect, setSizeSelect] = useState(initialSizeSelect);
  const [customSize, setCustomSize] = useState(() =>
    initialSizeSelect === CUSTOM ? (existing?.size ?? "") : "",
  );
  const [garmentType, setGarmentType] = useState<ApparelProductType | "">(
    () => {
      const g = existing?.garmentType?.trim();
      if (
        g === "T_SHIRT" ||
        g === "POLO" ||
        g === "COLETE" ||
        g === "BONE" ||
        g === "PERSONALIZADO" ||
        g === "EQUIPAMENTOS"
      ) {
        return g;
      }
      return "";
    },
  );
  const [productionProcess, setProductionProcess] = useState<
    "SUBLIMATION" | "DTF"
  >(existing?.productionProcess ?? "SUBLIMATION");
  const [unitPrice, setUnitPrice] = useState(() =>
    existing ? String(existing.unitPrice) : "0",
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [equipDetail, setEquipDetail] = useState(
    () => existing?.size?.trim() || "Único",
  );

  useEffect(() => {
    setSku(existing?.sku ?? "");
    setColorSelect(initialColorSelect);
    setCustomColor(
      initialColorSelect === CUSTOM ? (existing?.baseColor ?? "") : "",
    );
    setSizeSelect(initialSizeSelect);
    setCustomSize(
      initialSizeSelect === CUSTOM ? (existing?.size ?? "") : "",
    );
    const g = existing?.garmentType?.trim();
    setGarmentType(
      g === "T_SHIRT" ||
      g === "POLO" ||
      g === "COLETE" ||
      g === "BONE" ||
      g === "PERSONALIZADO" ||
      g === "EQUIPAMENTOS"
        ? g
        : "",
    );
    setProductionProcess(existing?.productionProcess ?? "SUBLIMATION");
    setUnitPrice(existing ? String(existing.unitPrice) : "0");
    setActive(existing?.active ?? true);
  }, [existing, initialColorSelect, initialSizeSelect]);

  const genericCatalog =
    product != null && !isVestuarioProduct(product);

  useEffect(() => {
    if (!product || isVestuarioProduct(product)) return;
    setEquipDetail(existing?.size?.trim() || "Único");
  }, [product, existing?.size, variantId]);

  const resolvedColorId: ApparelColorId | null =
    colorSelect && colorSelect !== CUSTOM
      ? (colorSelect as ApparelColorId)
      : null;

  const allowedProcesses = useMemo(
    () =>
      resolvedColorId
        ? allowedProcessesForColor(resolvedColorId)
        : (["SUBLIMATION", "DTF"] as const),
    [resolvedColorId],
  );

  useEffect(() => {
    if (genericCatalog) return;
    if (!allowedProcesses.includes(productionProcess)) {
      setProductionProcess(allowedProcesses[0] ?? "DTF");
    }
  }, [allowedProcesses, productionProcess, genericCatalog]);

  const baseColorValue =
    colorSelect === CUSTOM
      ? customColor.trim()
      : colorSelect
        ? colorSelect
        : undefined;

  const sizeValue =
    sizeSelect === CUSTOM
      ? customSize.trim()
      : sizeSelect
        ? sizeSelect
        : undefined;

  function generateSkuGeneric() {
    if (!product) return;
    const prefix = productSkuPrefix(product.code);
    const d = slugSkuPart(equipDetail.trim() || "ITEM");
    setSku(`${prefix}-${d}`.replace(/-+/g, "-"));
  }

  function generateSku() {
    if (!product) return;
    const c = slugSkuPart(
      baseColorValue ?? (colorSelect === CUSTOM ? "COR" : colorSelect || "X"),
    );
    const s = slugSkuPart(
      sizeValue ?? (sizeSelect === CUSTOM ? "TAM" : sizeSelect || "U"),
    );
    const prefix = productSkuPrefix(product.code);
    let next = `${prefix}-${c}-${s}`.replace(/-+/g, "-");
    if (
      resolvedColorId &&
      productionProcess !== defaultProductionProcessForCatalogColor(resolvedColorId)
    ) {
      const tag = productionProcess === "DTF" ? "DTF" : "SUB";
      next = `${next}-${tag}`.replace(/-+/g, "-");
    }
    setSku(next);
  }

  if (!product) return null;

  const darkHint =
    !genericCatalog && resolvedColorId && colorRequiresDtfOnly(resolvedColorId);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/[0.1] bg-zinc-950/95 p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90">
              {variantId ? "Editar" : "Nova"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">
              Variante · {product.name}
              {genericCatalog ? (
                <span className="ml-2 text-sm font-normal text-sky-300/90">
                  (catálogo genérico)
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <Field label="SKU">
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 font-mono text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Código único"
              />
              <button
                type="button"
                onClick={() =>
                  genericCatalog ? generateSkuGeneric() : generateSku()
                }
                className="shrink-0 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200 transition hover:bg-violet-500/20"
              >
                Gerar
              </button>
            </div>
          </Field>

          {genericCatalog ? (
            <Field label="Descrição da variante">
              <input
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
                value={equipDetail}
                onChange={(e) => setEquipDetail(e.target.value)}
                placeholder="ex.: Modelo Pro 220V · Pack 5 unidades"
              />
              <p className="mt-1.5 text-[10px] text-zinc-500">
                Texto livre para identificar o SKU (aparece na listagem admin).
              </p>
            </Field>
          ) : null}

          {!genericCatalog ? (
            <>
          <Field label="Cor do tecido">
            <select
              className={selectClass}
              style={selectChevronStyle}
              value={colorSelect}
              onChange={(e) => {
                const v = e.target.value;
                setColorSelect(v);
                if (v !== CUSTOM) setCustomColor("");
              }}
            >
              <option value="">— Seleccionar —</option>
              {APPAREL_COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value={CUSTOM}>Outra cor (personalizado)…</option>
            </select>
            {colorSelect === CUSTOM ? (
              <input
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="Texto livre (ex.: coral-claro)"
              />
            ) : null}
            {resolvedColorId ? (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="h-6 w-6 rounded-lg ring-2 ring-white/15"
                  style={{
                    backgroundColor:
                      APPAREL_COLOR_PREVIEW_HEX[resolvedColorId],
                  }}
                />
                <span className="text-[11px] text-zinc-500">
                  Pré-visualização alinhada à modelagem
                </span>
              </div>
            ) : null}
          </Field>

          <Field label="Tamanho">
            <select
              className={selectClass}
              style={selectChevronStyle}
              value={sizeSelect}
              onChange={(e) => {
                const v = e.target.value;
                setSizeSelect(v);
                if (v !== CUSTOM) setCustomSize("");
              }}
            >
              <option value="">— Seleccionar —</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={CUSTOM}>Outro tamanho…</option>
            </select>
            {sizeSelect === CUSTOM ? (
              <input
                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                placeholder="ex.: 5XL"
              />
            ) : null}
          </Field>

          <Field label="Tipo de peça (mockup)">
            <select
              className={selectClass}
              style={selectChevronStyle}
              value={garmentType}
              onChange={(e) =>
                setGarmentType(e.target.value as ApparelProductType | "")
              }
            >
              <option value="">— Seleccionar —</option>
              {APPAREL_PRODUCT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Processo de impressão
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-black/25 p-1">
              {(["SUBLIMATION", "DTF"] as const).map((proc) => {
                const disabled = !allowedProcesses.includes(proc);
                const activeP = productionProcess === proc;
                return (
                  <button
                    key={proc}
                    type="button"
                    disabled={disabled}
                    onClick={() => setProductionProcess(proc)}
                    className={`rounded-xl px-3 py-3 text-center text-xs font-bold transition ${
                      activeP
                        ? "bg-gradient-to-br from-amber-400 to-amber-500 text-zinc-950 shadow-md"
                        : disabled
                          ? "cursor-not-allowed text-zinc-700 opacity-40"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    {proc === "SUBLIMATION" ? "Sublimação" : "DTF"}
                  </button>
                );
              })}
            </div>
            {darkHint ? (
              <p className="mt-2 text-[11px] text-amber-200/80">
                Esta cor só permite DTF no catálogo Dádiva.
              </p>
            ) : null}
          </div>
            </>
          ) : null}

          <Field label="Preço unitário (Kz / AOA)">
            <input
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) =>
                setUnitPrice(
                  sanitizeUnsignedDecimalString(
                    e.target.value,
                    MONEY_DECIMAL_PLACES,
                  ),
                )
              }
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-4 py-3 transition hover:bg-zinc-900/70">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-600 text-amber-500 focus:ring-amber-400/30"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-sm text-zinc-300">
              <strong className="text-white">Activa</strong> — visível no
              catálogo do cliente
            </span>
          </label>
        </div>

        <div className="mt-8 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              saving ||
              !sku.trim() ||
              (genericCatalog
                ? !equipDetail.trim()
                : !baseColorValue || !sizeValue)
            }
            onClick={() => {
              const n = parseFloat(unitPrice.replace(",", "."));
              if (!Number.isFinite(n) || n < 0) return;
              if (genericCatalog) {
                void onSave({
                  sku: sku.trim(),
                  size: equipDetail.trim() || "Único",
                  baseColor: null,
                  productionProcess: "SUBLIMATION",
                  garmentType: null,
                  unitPrice: n,
                  currency: "AOA",
                  active,
                });
                return;
              }
              void onSave({
                sku: sku.trim(),
                baseColor: baseColorValue,
                size: sizeValue,
                productionProcess,
                garmentType: garmentType || undefined,
                unitPrice: n,
                currency: "AOA",
                active,
              });
            }}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/20 disabled:opacity-40"
          >
            Guardar variante
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkGeneratePanel({
  product,
  catalogTemplates,
  saving,
  onComplete,
}: {
  product: AdminProduct;
  catalogTemplates: ProductCatalogTemplate[];
  saving: boolean;
  onComplete: (opts: {
    garmentType: ApparelProductType;
    includeChildSizes: boolean;
  }) => Promise<void>;
}) {
  const [garmentType, setGarmentType] = useState<ApparelProductType>(() =>
    resolveGarmentType(product, catalogTemplates),
  );
  const [includeChildSizes, setIncludeChildSizes] = useState(true);

  useEffect(() => {
    setGarmentType(resolveGarmentType(product, catalogTemplates));
  }, [product, catalogTemplates]);

  const matrixCount = useMemo(
    () =>
      buildApparelCatalogVariantMatrix(garmentType, {
        includeChildSizes:
          garmentType !== "COLETE" &&
          garmentType !== "BONE" &&
          includeChildSizes,
      }).length,
    [garmentType, includeChildSizes],
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <p className="text-[11px] text-zinc-500">
        Cria todas as combinações do catálogo — SKU duplicado é ignorado. Os
        valores vêm da grelha <strong className="text-zinc-400">Preços</strong>{" "}
        (Kz por cor, adulto / infantil).
      </p>

      <div className="space-y-4">
        <Field label="Tipo de peça">
          <select
            className={selectClass}
            style={selectChevronStyle}
            value={garmentType}
            onChange={(e) =>
              setGarmentType(e.target.value as ApparelProductType)
            }
          >
            {APPAREL_PRODUCT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        {garmentType !== "COLETE" && garmentType !== "BONE" ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-600 text-cyan-500 focus:ring-cyan-400/30"
                checked={includeChildSizes}
                onChange={(e) => setIncludeChildSizes(e.target.checked)}
              />
              <span className="text-sm text-zinc-300">
                Incluir <strong className="text-white">tamanhos infantis</strong>{" "}
                ({CHILD_SIZES.length} tamanhos)
              </span>
            </label>
          ) : null}

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100/90">
          <strong className="text-cyan-300">{matrixCount}</strong> novas
          variantes serão tentadas.
        </div>

      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving || matrixCount === 0}
          onClick={() => {
            void onComplete({
              garmentType,
              includeChildSizes:
                garmentType !== "COLETE" &&
                garmentType !== "BONE" &&
                includeChildSizes,
            });
          }}
          className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {saving ? "A gerar…" : "Gerar variantes"}
        </button>
      </div>
    </div>
  );
}

function ModalBulkFullCatalog({
  templates,
  saving,
  onClose,
  onComplete,
}: {
  templates: ProductCatalogTemplate[];
  saving: boolean;
  onClose: () => void;
  onComplete: (opts: {
    includeChildSizes: boolean;
    defaultAdultPrice: number;
    defaultChildPrice: number;
  }) => Promise<void>;
}) {
  const [includeChildSizes, setIncludeChildSizes] = useState(true);
  const [defaultAdultPrice, setDefaultAdultPrice] = useState("");
  const [defaultChildPrice, setDefaultChildPrice] = useState("");

  const totalVariants = useMemo(() => {
    let n = 0;
    for (const t of templates) {
      if (!t.garmentType) continue;
      n += buildApparelCatalogVariantMatrix(t.garmentType, {
        includeChildSizes:
          t.garmentType !== "COLETE" &&
          t.garmentType !== "BONE" &&
          includeChildSizes,
      }).length;
    }
    return n;
  }, [includeChildSizes, templates]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/[0.1] bg-zinc-950/95 p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-400/90">
              Instalação
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">
              Vestuário ({templates.length} linhas)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Cria os produtos base (T-shirt, Polo, Colete, Boné) se ainda não existirem e gera{" "}
          <strong className="text-zinc-300">todas as cores × tamanhos × modelos</strong> por linha.
          Colete e boné só em adulto; boné usa tamanho único. Preços iniciais em{" "}
          <strong className="text-zinc-300">Kz (AOA)</strong> — aplica-se a todas as cores; podes
          afinar depois no separador Preços de cada produto.
        </p>

        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-4 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-600 text-violet-500 focus:ring-violet-400/30"
              checked={includeChildSizes}
              onChange={(e) => setIncludeChildSizes(e.target.checked)}
            />
            <span className="text-sm text-zinc-300">
              Incluir tamanhos infantis em <strong className="text-white">T-shirt</strong> e{" "}
              <strong className="text-white">Polo</strong>
            </span>
          </label>

          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-100/90">
            Até <strong className="text-violet-300">{totalVariants}</strong> variantes
            no total (menos SKU já existentes). A operação pode demorar um minuto.
          </div>

          <Field label="Preço adulto (Kz, todas as cores)">
            <input
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none focus:border-violet-400/40 focus:ring-2 focus:ring-violet-400/15"
              inputMode="decimal"
              value={defaultAdultPrice}
              onChange={(e) =>
                setDefaultAdultPrice(
                  sanitizeUnsignedDecimalString(
                    e.target.value,
                    MONEY_DECIMAL_PLACES,
                  ),
                )
              }
            />
          </Field>
          {includeChildSizes ? (
            <Field label="Preço infantil (Kz, todas as cores)">
              <input
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white outline-none focus:border-violet-400/40 focus:ring-2 focus:ring-violet-400/15"
                inputMode="decimal"
                value={defaultChildPrice}
                onChange={(e) =>
                  setDefaultChildPrice(
                    sanitizeUnsignedDecimalString(
                      e.target.value,
                      MONEY_DECIMAL_PLACES,
                    ),
                  )
                }
              />
            </Field>
          ) : (
            <p className="text-[11px] text-zinc-600">
              T-shirt e polo sem infantil: só o preço adulto é aplicado às linhas
              com grade infantil desactivada.
            </p>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const adult = parseFloat(defaultAdultPrice.replace(",", "."));
              if (!Number.isFinite(adult) || adult < 0) return;
              let child = parseFloat(defaultChildPrice.replace(",", "."));
              if (includeChildSizes) {
                if (!Number.isFinite(child) || child < 0) return;
              } else {
                child = adult;
              }
              void onComplete({
                includeChildSizes,
                defaultAdultPrice: adult,
                defaultChildPrice: child,
              });
            }}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/25 disabled:opacity-40"
          >
            {saving ? "A instalar…" : "Criar produtos e variantes"}
          </button>
        </div>
      </div>
    </div>
  );
}
