import { APPAREL_PRODUCT_TYPES } from "./apparel-catalog";
import { labelForDesignTemplateGarment } from "./design-template-garment";

export function garmentTypeLabelFromMeta(code: string | undefined): string {
  if (!code?.trim()) return "—";
  const fromTemplate = labelForDesignTemplateGarment(code);
  if (fromTemplate) return fromTemplate;
  const found = APPAREL_PRODUCT_TYPES.find((x) => x.id === code);
  return found?.label ?? code.replace(/_/g, " ");
}

export function orderLineMeta(
  meta: Record<string, unknown> | null | undefined,
): {
  garment: string;
  color: string;
  size: string;
  sku: string;
} {
  if (!meta || typeof meta !== "object") {
    return { garment: "—", color: "—", size: "—", sku: "—" };
  }
  const garmentBase = garmentTypeLabelFromMeta(
    typeof meta.garmentType === "string" ? meta.garmentType : undefined,
  );
  const ageRaw = meta.ageBand;
  const ageSuffix =
    typeof ageRaw === "string"
      ? ageRaw === "CHILD"
        ? " · infantil"
        : ageRaw === "ADULT"
          ? " · adulto"
          : ` · ${ageRaw.toLowerCase()}`
      : "";
  const garment =
    garmentBase === "—" && !ageSuffix
      ? "—"
      : garmentBase === "—"
        ? ageSuffix.replace(/^ · /, "")
        : `${garmentBase}${ageSuffix}`;
  const color =
    typeof meta.baseColor === "string" && meta.baseColor.trim()
      ? meta.baseColor.trim()
      : "—";
  const size =
    typeof meta.size === "string" && meta.size.trim() ? meta.size.trim() : "—";
  const sku =
    typeof meta.sku === "string" && meta.sku.trim() ? meta.sku.trim() : "—";
  return { garment, color, size, sku };
}

export function productionProcessLabel(p: string): string {
  if (p === "SUBLIMATION") return "Sublimação";
  if (p === "DTF") return "DTF";
  if (p === "STORE_RETAIL") return "Venda balcão";
  return p;
}

/** Balcão com linhas apenas STORE_RETAIL: venda na hora, sem pipeline têxtil. */
export function isBalcaoInstantInsumosOrder(d: {
  orderOrigin?: string | null;
  items?: { productionProcess?: string }[];
} | null): boolean {
  if (!d || d.orderOrigin !== "BALCAO") return false;
  const items = d.items;
  if (!items?.length) return false;
  return items.every((it) => it.productionProcess === "STORE_RETAIL");
}
