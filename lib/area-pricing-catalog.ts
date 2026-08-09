/**
 * Lona e Vinil — preço por área (Kz/m²).
 * Fórmula: altura × largura × preço/m² × quantidade.
 */
import type { CatalogProduct, CatalogVariant } from "@/lib/api-client";
import {
  resolvePricingKind,
  resolveProductCatalogFamily,
  type CatalogFamily,
  type ProductCatalogIdentity,
} from "@/lib/product-catalog";
import { randomClientId } from "@/lib/random-id";
import { parseQty, type BuiltArtigoItem } from "@/lib/pedido-artigos-lines";
import { findVariantInCatalog } from "@/lib/pedido-generic-lines";

export type AreaProductCode = "LONA" | "VINIL";

export type AreaVariantRow = {
  sku: string;
  size: string;
  unitPrice: number;
  metadata?: Record<string, unknown>;
};

export const AREA_PRODUCT_CODES: AreaProductCode[] = ["LONA", "VINIL"];

const LONA_TYPES: { id: string; label: string; pricePerM2: number }[] = [
  { id: "510-MATE", label: "510 g · Mate", pricePerM2: 8500 },
  { id: "510-BRILHO", label: "510 g · Brilho", pricePerM2: 9000 },
  { id: "440-MATE", label: "440 g · Mate", pricePerM2: 7500 },
];

const VINIL_TYPES: { id: string; label: string; pricePerM2: number }[] = [
  { id: "CAST-BRILHO", label: "Cast · Brilho", pricePerM2: 12000 },
  { id: "CAST-MATE", label: "Cast · Mate", pricePerM2: 11500 },
  { id: "MONO-BRILHO", label: "Monomérico · Brilho", pricePerM2: 9500 },
  { id: "RECORTE", label: "Recorte", pricePerM2: 8000 },
];

export function buildLonaVariantMatrix(productCode = "LONA"): AreaVariantRow[] {
  return LONA_TYPES.map((t) => ({
    sku: `${productCode}-${t.id}`,
    size: t.label,
    unitPrice: t.pricePerM2,
    metadata: { pricingKind: "AREA", material: t.id, areaUnit: "M" },
  }));
}

export function buildVinilVariantMatrix(productCode = "VINIL"): AreaVariantRow[] {
  return VINIL_TYPES.map((t) => ({
    sku: `${productCode}-${t.id}`,
    size: t.label,
    unitPrice: t.pricePerM2,
    metadata: { pricingKind: "AREA", material: t.id, areaUnit: "M" },
  }));
}

export function areaVariantMatrixForCode(productCode: string): AreaVariantRow[] | null {
  const c = productCode.trim().toUpperCase();
  if (c === "LONA") return buildLonaVariantMatrix(c);
  if (c === "VINIL") return buildVinilVariantMatrix(c);
  return null;
}

export function supportsAreaVariantMatrix(productCode: string): boolean {
  return areaVariantMatrixForCode(productCode) != null;
}

export function isAreaProductCode(code: string): code is AreaProductCode {
  const c = code.trim().toUpperCase();
  return c === "LONA" || c === "VINIL";
}

export function isAreaPricedProduct(
  product: ProductCatalogIdentity,
): boolean {
  return resolvePricingKind(product) === "AREA";
}

export function isAreaPricedVariant(variant: CatalogVariant): boolean {
  const meta =
    variant.metadata &&
    typeof variant.metadata === "object" &&
    !Array.isArray(variant.metadata)
      ? (variant.metadata as Record<string, unknown>)
      : null;
  return meta?.pricingKind === "AREA";
}

export function filterAreaCatalogProducts(
  catalog: CatalogProduct[] | null | undefined,
): CatalogProduct[] {
  if (!catalog?.length) return [];
  return catalog.filter((p) => isAreaPricedProduct(p));
}

export function areaCatalogSyncActive(
  catalog: CatalogProduct[] | null | undefined,
): boolean {
  return filterAreaCatalogProducts(catalog).some((p) => p.variants.length > 0);
}

export type AreaLineForm = {
  id: string;
  productId: string;
  variantId: string;
  widthM: string;
  heightM: string;
  quantity: string;
  pricePerM2: string;
  lineTotal: string;
};

export function parseDimension(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

export function variantPricePerM2(variant: CatalogVariant): number | null {
  const raw = variant.unitPrice;
  const n =
    typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** total = altura × largura × preço/m² × quantidade */
export function computeAreaLineTotal(
  widthM: number,
  heightM: number,
  pricePerM2: number,
  quantity: number,
): number {
  const area = widthM * heightM;
  return Math.round(area * pricePerM2 * quantity * 100) / 100;
}

export function syncAreaLineTotals(line: AreaLineForm): AreaLineForm {
  const w = parseDimension(line.widthM);
  const h = parseDimension(line.heightM);
  const price = parseFloat(line.pricePerM2.replace(",", "."));
  const qty = parseQty(line.quantity) || 1;
  if (w == null || h == null || !Number.isFinite(price) || price < 0) {
    return { ...line, lineTotal: "0" };
  }
  const total = computeAreaLineTotal(w, h, price, qty);
  return {
    ...line,
    lineTotal: Number.isInteger(total) ? String(total) : total.toFixed(2),
  };
}

export function newAreaLine(catalog: CatalogProduct[] | null | undefined): AreaLineForm {
  const products = filterAreaCatalogProducts(catalog);
  const first = products[0];
  const variant = first?.variants.find((v) => v.active) ?? first?.variants[0];
  const price = variant ? variantPricePerM2(variant) : null;
  const base: AreaLineForm = {
    id: randomClientId(),
    productId: first?.id ?? "",
    variantId: variant?.id ?? "",
    widthM: "",
    heightM: "",
    quantity: "1",
    pricePerM2: price != null ? String(price) : "0",
    lineTotal: "0",
  };
  return syncAreaLineTotals(base);
}

export function areaLineWithSyncedVariant(
  line: AreaLineForm,
  catalog: CatalogProduct[] | null | undefined,
): AreaLineForm {
  if (!catalog?.length || !line.variantId) return syncAreaLineTotals(line);
  const hit = findVariantInCatalog(catalog, line.variantId);
  if (!hit) return syncAreaLineTotals(line);
  const price = variantPricePerM2(hit.variant);
  return syncAreaLineTotals({
    ...line,
    productId: hit.product.id,
    pricePerM2: price != null ? String(price) : line.pricePerM2,
  });
}

export type BuiltAreaItem = BuiltArtigoItem & {
  widthM: number;
  heightM: number;
};

export function buildItemsFromAreaLines(
  lines: AreaLineForm[],
  catalog: CatalogProduct[],
):
  | { ok: true; items: BuiltAreaItem[] }
  | { ok: false; message: string } {
  const items: BuiltAreaItem[] = [];
  const active = lines.filter(
    (l) =>
      parseDimension(l.widthM) != null &&
      parseDimension(l.heightM) != null &&
      parseQty(l.quantity) >= 1,
  );

  if (active.length === 0) return { ok: true, items: [] };

  for (let idx = 0; idx < active.length; idx++) {
    const l = active[idx]!;
    const w = parseDimension(l.widthM);
    const h = parseDimension(l.heightM);
    const qty = parseQty(l.quantity);
    if (w == null || h == null) {
      return {
        ok: false,
        message: `Lona/Vinil ${idx + 1}: indica altura e largura válidas (em metros).`,
      };
    }
    if (qty < 1) {
      return {
        ok: false,
        message: `Lona/Vinil ${idx + 1}: quantidade mínima é 1.`,
      };
    }

    const hit = findVariantInCatalog(catalog, l.variantId);
    if (!hit || hit.product.id !== l.productId) {
      return {
        ok: false,
        message: `Lona/Vinil ${idx + 1}: selecciona produto e tipo válidos.`,
      };
    }

    const pricePerM2 = variantPricePerM2(hit.variant);
    if (pricePerM2 == null) {
      return {
        ok: false,
        message: `Lona/Vinil ${idx + 1}: preço por m² não definido no catálogo.`,
      };
    }

    items.push({
      productVariantId: hit.variant.id,
      quantity: qty,
      widthM: w,
      heightM: h,
    });
  }

  return { ok: true, items };
}

export function estimateAreaSubtotal(
  lines: AreaLineForm[],
  catalog: CatalogProduct[],
): number {
  let total = 0;
  for (const l of lines) {
    const synced = areaLineWithSyncedVariant(l, catalog);
    const n = parseFloat(synced.lineTotal.replace(",", "."));
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

export function areaLineLabel(
  catalog: CatalogProduct[],
  line: AreaLineForm,
): string {
  const hit = findVariantInCatalog(catalog, line.variantId);
  if (!hit) return "—";
  const w = line.widthM.trim();
  const h = line.heightM.trim();
  const dim = w && h ? `${w}×${h} m` : "—";
  return `${hit.product.name} · ${hit.variant.size ?? hit.variant.sku} · ${dim}`;
}

/** Produtos com preço fixo (caneca, cartão, PVC) — exclui Lona/Vinil. */
export function filterFixedImpressaoProducts(
  catalog: CatalogProduct[] | null | undefined,
): CatalogProduct[] {
  if (!catalog?.length) return [];
  return catalog.filter((p) => {
    const family = resolveProductCatalogFamily(p);
    if (family === "CANECA") return true;
    if (family === "IMPRESSAO_PLANA") return !isAreaPricedProduct(p);
    return false;
  });
}
