/**
 * Linhas de pedido para canecas, cartões e impressão plana (sem matriz apparel).
 */
import type { CatalogProduct, CatalogVariant } from "@/lib/api-client";
import {
  filterFixedImpressaoProducts,
} from "@/lib/area-pricing-catalog";
import {
  resolveProductCatalogFamily,
  type CatalogFamily,
} from "@/lib/product-catalog";
import { randomClientId } from "@/lib/random-id";
import {
  formatCatalogUnitPrice,
  parseQty,
  type BuiltArtigoItem,
} from "@/lib/pedido-artigos-lines";

export type GenericLineForm = {
  id: string;
  productId: string;
  variantId: string;
  quantity: string;
  unitPrice: string;
};

export function filterGenericCatalogProducts(
  catalog: CatalogProduct[] | null | undefined,
): CatalogProduct[] {
  return filterFixedImpressaoProducts(catalog);
}

export function genericCatalogSyncActive(
  catalog: CatalogProduct[] | null | undefined,
): boolean {
  return filterGenericCatalogProducts(catalog).some((p) => p.variants.length > 0);
}

export function newGenericLine(
  catalog: CatalogProduct[] | null | undefined,
): GenericLineForm {
  const products = filterGenericCatalogProducts(catalog);
  const first = products[0];
  const variant = first?.variants.find((v) => v.active) ?? first?.variants[0];
  const price = variant ? formatCatalogUnitPrice(variant.unitPrice) : null;
  return {
    id: randomClientId(),
    productId: first?.id ?? "",
    variantId: variant?.id ?? "",
    quantity: "",
    unitPrice: price ?? "0",
  };
}

export function variantsForProduct(
  catalog: CatalogProduct[],
  productId: string,
): CatalogVariant[] {
  const p = catalog.find((x) => x.id === productId);
  if (!p) return [];
  return p.variants.filter((v) => v.active);
}

export function findVariantInCatalog(
  catalog: CatalogProduct[],
  variantId: string,
): { product: CatalogProduct; variant: CatalogVariant } | null {
  for (const p of catalog) {
    const v = p.variants.find((x) => x.id === variantId && x.active);
    if (v) return { product: p, variant: v };
  }
  return null;
}

export function genericLineWithSyncedPrice(
  line: GenericLineForm,
  catalog: CatalogProduct[] | null | undefined,
): GenericLineForm {
  if (!catalog?.length || !line.variantId) return line;
  const hit = findVariantInCatalog(catalog, line.variantId);
  if (!hit) return line;
  const p = formatCatalogUnitPrice(hit.variant.unitPrice);
  return {
    ...line,
    productId: hit.product.id,
    unitPrice: p ?? line.unitPrice,
  };
}

export function genericLineTotalPieces(line: GenericLineForm): number {
  return parseQty(line.quantity);
}

export function genericLineLabel(
  catalog: CatalogProduct[],
  line: GenericLineForm,
): string {
  const hit = findVariantInCatalog(catalog, line.variantId);
  if (!hit) return "—";
  const color = hit.variant.baseColor?.trim();
  const size = hit.variant.size?.trim();
  const parts = [hit.product.name];
  if (color) parts.push(color);
  if (size) parts.push(size);
  return parts.join(" · ");
}

export function buildItemsFromGenericLines(
  lines: GenericLineForm[],
  catalog: CatalogProduct[],
):
  | { ok: true; items: BuiltArtigoItem[] }
  | { ok: false; message: string } {
  const items: BuiltArtigoItem[] = [];
  const activeLines = lines.filter((l) => parseQty(l.quantity) >= 1);

  if (activeLines.length === 0) {
    return { ok: true, items: [] };
  }

  for (let idx = 0; idx < activeLines.length; idx++) {
    const l = activeLines[idx]!;
    const qty = parseQty(l.quantity);
    if (qty < 1) continue;

    const hit = findVariantInCatalog(catalog, l.variantId);
    if (!hit) {
      return {
        ok: false,
        message: `Artigo extra ${idx + 1}: selecciona um produto e variante válidos no catálogo.`,
      };
    }
    if (hit.product.id !== l.productId) {
      return {
        ok: false,
        message: `Artigo extra ${idx + 1}: a variante não pertence ao produto seleccionado.`,
      };
    }
    items.push({ productVariantId: hit.variant.id, quantity: qty });
  }

  return { ok: true, items };
}

export function estimateGenericSubtotal(
  lines: GenericLineForm[],
  catalog: CatalogProduct[],
): number {
  let total = 0;
  for (const l of lines) {
    const qty = parseQty(l.quantity);
    if (qty < 1) continue;
    const hit = findVariantInCatalog(catalog, l.variantId);
    if (!hit) continue;
    const priceRaw = hit.variant.unitPrice;
    const price =
      typeof priceRaw === "number"
        ? priceRaw
        : parseFloat(String(priceRaw).replace(",", "."));
    if (Number.isFinite(price) && price >= 0) total += price * qty;
  }
  return total;
}

export function catalogFamilyForProductCode(
  code: string,
): CatalogFamily | null {
  const c = code.trim().toUpperCase();
  if (c === "CANECA") return "CANECA";
  if (c === "CARTAO-VISITA" || c === "PASSE-PVC") return "IMPRESSAO_PLANA";
  if (c === "LONA" || c === "VINIL") return "IMPRESSAO_PLANA";
  return null;
}
