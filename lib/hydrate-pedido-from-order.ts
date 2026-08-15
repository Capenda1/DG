/**
 * Reconstrói formulários de artigos a partir das linhas de um pedido (rascunho).
 */
import type {
  CatalogProduct,
  CatalogVariant,
  OrderItemRow,
} from "@/lib/api-client";
import {
  APPAREL_COLORS,
  APPAREL_PRODUCT_TYPES,
  allowedSizes,
  defaultBrandForSelection,
  normalizeProductionProcessForColor,
  type ApparelAgeBand,
  type ApparelBrandId,
  type ApparelColorId,
  type ApparelProductType,
  type ProductionProcess,
} from "@/lib/apparel-catalog";
import {
  newAreaLine,
  syncAreaLineTotals,
  isAreaPricedProduct,
  type AreaLineForm,
} from "@/lib/area-pricing-catalog";
import {
  applyLineConstraints,
  emptyQuantitiesForSizes,
  formatCatalogUnitPrice,
  newLine,
  type LineForm,
} from "@/lib/pedido-artigos-lines";
import {
  newGenericLine,
  type GenericLineForm,
} from "@/lib/pedido-generic-lines";
import { resolveProductCatalogFamily } from "@/lib/product-catalog";
import { randomClientId } from "@/lib/random-id";

function metaOf(item: OrderItemRow): Record<string, unknown> {
  const m = item.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) return m;
  return {};
}

function findVariantInCatalog(
  catalog: CatalogProduct[],
  variantId: string,
): { product: CatalogProduct; variant: CatalogVariant } | null {
  for (const product of catalog) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function resolveColorId(
  meta: Record<string, unknown>,
  baseColor: string | null | undefined,
): ApparelColorId {
  const colorId = meta.colorId;
  if (typeof colorId === "string" && colorId.trim()) {
    const hit = APPAREL_COLORS.find((c) => c.id === colorId.trim());
    if (hit) return hit.id;
  }
  const raw = (baseColor ?? meta.baseColor ?? "").toString().trim();
  if (raw) {
    const byId = APPAREL_COLORS.find(
      (c) => c.id.toLowerCase() === raw.toLowerCase(),
    );
    if (byId) return byId.id;
    const byLabel = APPAREL_COLORS.find(
      (c) => c.label.toLowerCase() === raw.toLowerCase(),
    );
    if (byLabel) return byLabel.id;
  }
  return "branco";
}

function resolveAgeBand(
  meta: Record<string, unknown>,
  size: string | null | undefined,
): ApparelAgeBand {
  const ab = meta.ageBand;
  if (ab === "CHILD" || ab === "INFANTIL" || ab === "infantil") return "CHILD";
  if (ab === "ADULT" || ab === "ADULTO" || ab === "adulto") return "ADULT";
  const s = (size ?? meta.size ?? "").toString().trim();
  if (/^(2|4|6|8|10|12|14)$/.test(s)) return "CHILD";
  return "ADULT";
}

function resolveBrandId(
  meta: Record<string, unknown>,
  productType: ApparelProductType,
  ageBand: ApparelAgeBand,
): ApparelBrandId {
  const raw = meta.brandId;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim() as ApparelBrandId;
  }
  return defaultBrandForSelection(productType, ageBand);
}

export type HydratedPedidoForms = {
  apparel: LineForm[];
  generic: GenericLineForm[];
  area: AreaLineForm[];
};

export function hydratePedidoFormsFromOrderItems(
  items: OrderItemRow[],
  catalog: CatalogProduct[],
): HydratedPedidoForms {
  const apparelMap = new Map<string, LineForm>();
  const generic: GenericLineForm[] = [];
  const area: AreaLineForm[] = [];

  for (const item of items) {
    const meta = metaOf(item);
    if (meta.lineType === "STORE_RETAIL" || meta.insumoId != null) {
      continue;
    }

    const variantId =
      (typeof item.productVariantId === "string" && item.productVariantId) ||
      (typeof meta.productVariantId === "string"
        ? meta.productVariantId
        : "") ||
      "";

    const found = variantId ? findVariantInCatalog(catalog, variantId) : null;
    const product = found?.product;
    const variant = found?.variant;

    const isArea =
      meta.pricingKind === "AREA" ||
      (product != null && isAreaPricedProduct(product));

    if (isArea) {
      const width =
        meta.widthM != null ? String(meta.widthM).replace(".", ",") : "";
      const height =
        meta.heightM != null ? String(meta.heightM).replace(".", ",") : "";
      const price =
        meta.pricePerM2 != null
          ? String(meta.pricePerM2)
          : variant
            ? formatCatalogUnitPrice(variant.unitPrice) ?? "0"
            : "0";
      const line = syncAreaLineTotals({
        id: randomClientId(),
        productId: product?.id ?? String(meta.productId ?? ""),
        variantId: variant?.id ?? variantId,
        widthM: width,
        heightM: height,
        quantity: String(Math.max(1, Math.round(Number(item.quantity) || 1))),
        pricePerM2: price,
        lineTotal: "0",
      });
      area.push(line);
      continue;
    }

    const family = product
      ? resolveProductCatalogFamily(product)
      : typeof meta.catalogFamily === "string"
        ? meta.catalogFamily
        : null;

    if (
      family === "CANECA" ||
      family === "IMPRESSAO_PLANA" ||
      family === "GENERICO"
    ) {
      generic.push({
        id: randomClientId(),
        productId: product?.id ?? String(meta.productId ?? ""),
        variantId: variant?.id ?? variantId,
        quantity: String(Math.max(0, Math.round(Number(item.quantity) || 0))),
        unitPrice: variant
          ? formatCatalogUnitPrice(variant.unitPrice) ?? "0"
          : formatCatalogUnitPrice(item.unitPrice) ?? "0",
      });
      continue;
    }

    const gtRaw =
      (typeof meta.garmentType === "string" && meta.garmentType) ||
      variant?.garmentType ||
      "";
    const productType = gtRaw.trim() as ApparelProductType;
    if (!APPAREL_PRODUCT_TYPES.some((t) => t.id === productType)) {
      // fallback: linha genérica se tiver variante
      if (product && variant) {
        generic.push({
          id: randomClientId(),
          productId: product.id,
          variantId: variant.id,
          quantity: String(Math.max(0, Math.round(Number(item.quantity) || 0))),
          unitPrice: formatCatalogUnitPrice(variant.unitPrice) ?? "0",
        });
      }
      continue;
    }

    const size =
      (typeof meta.size === "string" && meta.size.trim()) ||
      variant?.size?.trim() ||
      "";
    const ageBand = resolveAgeBand(meta, size);
    const brandId = resolveBrandId(meta, productType, ageBand);
    const colorId = resolveColorId(meta, variant?.baseColor);
    const productionProcess = normalizeProductionProcessForColor(
      colorId,
      (variant?.productionProcess ??
        item.productionProcess ??
        "SUBLIMATION") as ProductionProcess,
    );
    const key = `${productType}|${ageBand}|${brandId}|${colorId}|${productionProcess}`;
    let line = apparelMap.get(key);
    if (!line) {
      const sizes = allowedSizes(productType, ageBand);
      line = applyLineConstraints({
        id: randomClientId(),
        productType,
        ageBand,
        brandId,
        sizeQuantities: emptyQuantitiesForSizes(sizes),
        colorId,
        productionProcess,
        unitPrice: variant
          ? formatCatalogUnitPrice(variant.unitPrice) ?? "0"
          : "0",
      });
      apparelMap.set(key, line);
    }
    if (size) {
      const qty = Math.max(0, Math.round(Number(item.quantity) || 0));
      const prev = parseInt(line.sizeQuantities[size] || "0", 10) || 0;
      line.sizeQuantities[size] = String(prev + qty);
    }
  }

  return {
    apparel: apparelMap.size > 0 ? [...apparelMap.values()] : [newLine()],
    generic: generic.length > 0 ? generic : [newGenericLine(catalog)],
    area: area.length > 0 ? area : [newAreaLine(catalog)],
  };
}
