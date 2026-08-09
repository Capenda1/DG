/**
 * Resolução do tipo de mockup 2D (vestuário, caneca, impressão plana).
 */
import {
  previewAppearanceFromProductName,
  type ApparelProductType,
} from "@/lib/apparel-catalog";
import {
  flatAspectFromProductCode,
  isNonApparelOrderFamily,
  mugColorHexFromVariant,
} from "@/lib/non-apparel-catalog";
import {
  resolvePreviewKind,
  type CatalogFamily,
  type ModelagemPreviewKind,
} from "@/lib/product-catalog";

export type { ModelagemPreviewKind };

export type ModelagemPreview = {
  kind: ModelagemPreviewKind;
  productType?: ApparelProductType;
  baseColorHex: string;
  caption: string;
  flatAspect?: number;
  productCode?: string;
};

type OrderItemLike = {
  productName?: string | null;
  metadata?: unknown;
};

function itemMetadata(item: OrderItemLike | undefined): Record<string, unknown> {
  if (
    !item?.metadata ||
    typeof item.metadata !== "object" ||
    Array.isArray(item.metadata)
  ) {
    return {};
  }
  return item.metadata as Record<string, unknown>;
}

function catalogFamilyFromItem(item: OrderItemLike | undefined): CatalogFamily | null {
  const meta = itemMetadata(item);
  const raw = meta.catalogFamily;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim() as CatalogFamily;
  }
  return null;
}

function productCodeFromItem(item: OrderItemLike | undefined): string {
  const meta = itemMetadata(item);
  const code = meta.productCode;
  if (typeof code === "string" && code.trim()) return code.trim();
  return "";
}

function garmentTypeFromItem(
  item: OrderItemLike | undefined,
): ApparelProductType | undefined {
  const meta = itemMetadata(item);
  const gt = meta.garmentType;
  if (
    gt === "T_SHIRT" ||
    gt === "POLO" ||
    gt === "COLETE" ||
    gt === "BONE" ||
    gt === "PERSONALIZADO" ||
    gt === "EQUIPAMENTOS"
  ) {
    return gt;
  }
  return undefined;
}

function areaAspectFromMetadata(meta: Record<string, unknown>): number {
  const wRaw = meta.widthM;
  const hRaw = meta.heightM;
  const w =
    typeof wRaw === "number"
      ? wRaw
      : parseFloat(String(wRaw ?? "").replace(",", "."));
  const h =
    typeof hRaw === "number"
      ? hRaw
      : parseFloat(String(hRaw ?? "").replace(",", "."));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return w / h;
  }
  return 2;
}

/** Determina o mockup correcto a partir do primeiro item do pedido. */
export function resolveModelagemPreviewFromOrder(
  items: OrderItemLike[] | null | undefined,
): ModelagemPreview {
  const item = items?.[0];
  const productCode = productCodeFromItem(item);
  const family = catalogFamilyFromItem(item);
  const meta = itemMetadata(item);

  if (family && isNonApparelOrderFamily(family)) {
    const kind = resolvePreviewKind({ catalogFamily: family, code: productCode });
    if (kind === "MUG") {
      return {
        kind: "MUG",
        baseColorHex: mugColorHexFromVariant(
          typeof meta.baseColor === "string" ? meta.baseColor : null,
          meta,
        ),
        caption: item?.productName?.trim() || "Caneca sublimação",
        productCode: productCode || "CANECA",
      };
    }
    if (kind === "FLAT") {
      return {
        kind: "FLAT",
        baseColorHex: "#ffffff",
        caption: item?.productName?.trim() || "Impressão plana",
        flatAspect: flatAspectFromProductCode(productCode, meta),
        productCode: productCode || undefined,
      };
    }
    if (kind === "AREA") {
      return {
        kind: "AREA",
        baseColorHex: "#f5f5f4",
        caption: item?.productName?.trim() || "Lona / Vinil",
        flatAspect: areaAspectFromMetadata(meta),
        productCode: productCode || undefined,
      };
    }
  }

  if (productCode) {
    const kind = resolvePreviewKind({ code: productCode });
    if (kind === "MUG") {
      return {
        kind: "MUG",
        baseColorHex: mugColorHexFromVariant(
          typeof meta.baseColor === "string" ? meta.baseColor : null,
          meta,
        ),
        caption: item?.productName?.trim() || "Caneca sublimação",
        productCode,
      };
    }
    if (kind === "FLAT") {
      return {
        kind: "FLAT",
        baseColorHex: "#ffffff",
        caption: item?.productName?.trim() || "Impressão plana",
        flatAspect: flatAspectFromProductCode(productCode, meta),
        productCode,
      };
    }
    if (kind === "AREA") {
      return {
        kind: "AREA",
        baseColorHex: "#f5f5f4",
        caption: item?.productName?.trim() || "Lona / Vinil",
        flatAspect: areaAspectFromMetadata(meta),
        productCode,
      };
    }
  }

  const fromGarment = garmentTypeFromItem(item);
  if (fromGarment) {
    const apparel = previewAppearanceFromProductName(item?.productName ?? "");
    return { ...apparel, productType: fromGarment, kind: "APPAREL" };
  }

  const apparel = previewAppearanceFromProductName(item?.productName ?? "");
  return { ...apparel, kind: "APPAREL" };
}
