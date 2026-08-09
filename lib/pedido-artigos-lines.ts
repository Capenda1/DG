/**
 * Lógica partilhada entre «Novo pedido» (cliente) e PDV (balcão):
 * linhas de artigo apparel, correspondência com o catálogo e geração de itens API.
 */
import type { CatalogProduct, CatalogVariant } from "@/lib/api-client";
import {
  APPAREL_COLORS,
  APPAREL_PRODUCT_TYPES,
  allowedBrands,
  allowedSizes,
  labelForApparelBrandId,
  type ApparelAgeBand,
  type ApparelBrandId,
  type ApparelColorId,
  type ApparelProductType,
  effectiveVariantProductionProcess,
  normalizeProductionProcessForColor,
  type ProductionProcess,
  sizesMatchForCatalog,
  validateApparelLine,
  variantAgeBandMatchesSelection,
  defaultBrandForSelection,
  variantBrandMatchesSelection,
} from "@/lib/apparel-catalog";
import { randomClientId } from "@/lib/random-id";

export type LineForm = {
  id: string;
  productType: ApparelProductType;
  ageBand: ApparelAgeBand;
  brandId: ApparelBrandId;
  /** Quantidade por tamanho (string para inputs; vazio ou "0" = não pedir esse tamanho). */
  sizeQuantities: Record<string, string>;
  colorId: ApparelColorId;
  productionProcess: ProductionProcess;
  unitPrice: string;
};

export function emptyQuantitiesForSizes(sizes: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const s of sizes) {
    o[s] = "";
  }
  return o;
}

export function applyLineConstraints(line: LineForm): LineForm {
  const { productType } = line;
  let { ageBand } = line;
  if (productType === "COLETE" || productType === "BONE") {
    ageBand = "ADULT";
  }
  const brands = allowedBrands(productType, ageBand);
  let brandId = line.brandId;
  if (!brands.some((b) => b.id === brandId)) {
    brandId = defaultBrandForSelection(productType, ageBand);
  }
  const sizes = allowedSizes(productType, ageBand);
  const nextQty: Record<string, string> = {};
  for (const s of sizes) {
    nextQty[s] = line.sizeQuantities[s] ?? "";
  }
  const productionProcess = normalizeProductionProcessForColor(
    line.colorId,
    line.productionProcess,
  );
  return {
    ...line,
    productType,
    ageBand,
    brandId,
    sizeQuantities: nextQty,
    productionProcess,
  };
}

export function newLine(): LineForm {
  const productType: ApparelProductType = "T_SHIRT";
  const ageBand: ApparelAgeBand = "ADULT";
  const sizes = allowedSizes(productType, ageBand);
  const brandId = defaultBrandForSelection(productType, ageBand);
  return applyLineConstraints({
    id: randomClientId(),
    productType,
    ageBand,
    brandId,
    sizeQuantities: emptyQuantitiesForSizes(sizes),
    colorId: "branco",
    productionProcess: "SUBLIMATION",
    unitPrice: "0",
  });
}

export function parseQty(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function lineTotalPieces(line: LineForm): number {
  return Object.values(line.sizeQuantities).reduce(
    (acc, v) => acc + parseQty(v),
    0,
  );
}

/** Resumo legível da linha para UI (conta cliente). */
export function apparelLineSummaryLabel(line: LineForm): string | null {
  const pieces = lineTotalPieces(line);
  if (pieces < 1) return null;
  const type =
    APPAREL_PRODUCT_TYPES.find((t) => t.id === line.productType)?.label ??
    line.productType;
  const brand = labelForApparelBrandId(line.brandId) || line.brandId;
  const color =
    APPAREL_COLORS.find((c) => c.id === line.colorId)?.label ?? line.colorId;
  const proc = line.productionProcess === "DTF" ? "DTF" : "Sublimação";
  const faixa = line.ageBand === "ADULT" ? "Adulto" : "Infantil";
  return `${type} · ${faixa} · ${brand} · ${color} · ${proc} · ${pieces} peça${pieces !== 1 ? "s" : ""}`;
}

export function isCatalogSyncActive(
  catalog: CatalogProduct[] | null | undefined,
): boolean {
  if (!catalog || catalog.length === 0) return false;
  return catalog.some((p) => p.variants.length > 0);
}

export function formatCatalogUnitPrice(raw: unknown): string | null {
  if (raw == null) return null;
  const n =
    typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(2).replace(/\.?0+$/, "");
  return s;
}

export function pickBestCatalogVariant(
  candidates: CatalogVariant[],
  wantProc: ProductionProcess,
): CatalogVariant {
  if (candidates.length === 1) return candidates[0]!;
  const scored = candidates.map((v) => {
    const stored = v.productionProcess?.trim();
    let rank = 0;
    if (stored === wantProc) rank += 3;
    else if (!stored) rank += 1;
    return { v, rank, sku: v.sku };
  });
  scored.sort((a, b) => b.rank - a.rank || a.sku.localeCompare(b.sku));
  return scored[0]!.v;
}

/**
 * Encontra variante que corresponde à selecção do formulário estático.
 * Exige `garmentType` na variante igual ao tipo de peça; se `metadata.brandId` existir, tem de coincidir.
 */
export function findCatalogVariantForSelection(
  catalog: CatalogProduct[],
  sel: {
    productType: ApparelProductType;
    ageBand: ApparelAgeBand;
    brandId: ApparelBrandId;
    size: string;
    colorId: ApparelColorId;
    productionProcess: ProductionProcess;
  },
): CatalogVariant | null {
  const wantProc = normalizeProductionProcessForColor(
    sel.colorId,
    sel.productionProcess,
  );
  const colorNorm = sel.colorId.trim().toLowerCase();
  const candidates: CatalogVariant[] = [];

  for (const p of catalog) {
    for (const v of p.variants) {
      if (!v.active) continue;
      const vProc = effectiveVariantProductionProcess(
        v.productionProcess,
        sel.colorId,
      );
      if (vProc !== wantProc) continue;
      const vc = (v.baseColor?.trim().toLowerCase() ?? "") || "";
      if (vc !== colorNorm) continue;
      const vs = (v.size?.trim() ?? "") || "";
      if (!sizesMatchForCatalog(sel.size, vs)) continue;
      const gt = v.garmentType?.trim() ?? "";
      if (!gt || gt !== sel.productType) continue;
      const meta =
        v.metadata &&
        typeof v.metadata === "object" &&
        !Array.isArray(v.metadata)
          ? (v.metadata as Record<string, unknown>)
          : null;
      if (
        !variantBrandMatchesSelection(
          sel.productType,
          sel.brandId,
          meta?.brandId != null ? String(meta.brandId) : null,
        )
      ) {
        continue;
      }
      if (
        !variantAgeBandMatchesSelection(
          sel.ageBand,
          sel.size,
          meta?.ageBand != null ? String(meta.ageBand) : undefined,
        )
      ) {
        continue;
      }
      candidates.push(v);
    }
  }

  if (candidates.length === 0) return null;
  return pickBestCatalogVariant(candidates, wantProc);
}

/** Primeira variante do catálogo que casa com a linha (qualquer tamanho válido). */
export function findFirstCatalogVariantForLine(
  catalog: CatalogProduct[],
  line: Pick<
    LineForm,
    | "productType"
    | "ageBand"
    | "brandId"
    | "colorId"
    | "productionProcess"
  >,
): CatalogVariant | null {
  const sizes = allowedSizes(line.productType, line.ageBand);
  for (const size of sizes) {
    const v = findCatalogVariantForSelection(catalog, {
      productType: line.productType,
      ageBand: line.ageBand,
      brandId: line.brandId,
      size,
      colorId: line.colorId,
      productionProcess: line.productionProcess,
    });
    if (v) return v;
  }
  return null;
}

export function lineWithSyncedUnitPrice(
  line: LineForm,
  catalog: CatalogProduct[] | null | undefined,
): LineForm {
  if (!catalog?.length) return line;
  const v = findFirstCatalogVariantForLine(catalog, line);
  if (!v) return line;
  const p = formatCatalogUnitPrice(v.unitPrice);
  if (!p) return line;
  return { ...line, unitPrice: p };
}

/** Cores com pelo menos um tamanho activo no catálogo para a linha actual. */
export function catalogColorIdsInStock(
  catalog: CatalogProduct[],
  line: Pick<
    LineForm,
    "productType" | "ageBand" | "brandId" | "productionProcess"
  >,
): ApparelColorId[] {
  const sizes = allowedSizes(line.productType, line.ageBand);
  const ids: ApparelColorId[] = [];
  for (const c of APPAREL_COLORS) {
    let hit = false;
    for (const size of sizes) {
      if (
        findCatalogVariantForSelection(catalog, {
          productType: line.productType,
          ageBand: line.ageBand,
          brandId: line.brandId,
          size,
          colorId: c.id,
          productionProcess: normalizeProductionProcessForColor(
            c.id,
            line.productionProcess,
          ),
        })
      ) {
        hit = true;
        break;
      }
    }
    if (hit) ids.push(c.id);
  }
  return ids;
}

/** Remove quantidades em tamanhos que deixaram de existir no catálogo para a combinação actual. */
export function stripUnavailableCatalogQuantities(
  line: LineForm,
  catalog: CatalogProduct[],
): LineForm {
  const sizes = allowedSizes(line.productType, line.ageBand);
  const nextQty = { ...line.sizeQuantities };
  for (const size of sizes) {
    const variant = findCatalogVariantForSelection(catalog, {
      productType: line.productType,
      ageBand: line.ageBand,
      brandId: line.brandId,
      size,
      colorId: line.colorId,
      productionProcess: normalizeProductionProcessForColor(
        line.colorId,
        line.productionProcess,
      ),
    });
    if (!variant && (nextQty[size] ?? "").trim() !== "") {
      nextQty[size] = "";
    }
  }
  return { ...line, sizeQuantities: nextQty };
}

export type BuiltArtigoItem = { productVariantId: string; quantity: number };

/** Converte linhas do formulário em `items` para createOrder / createCounterOrder. */
export function buildItemsFromPedidoArtigos(
  lines: LineForm[],
  catalog: CatalogProduct[],
):
  | { ok: true; items: BuiltArtigoItem[] }
  | { ok: false; message: string } {
  const items: BuiltArtigoItem[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx]!;
    const sizes = allowedSizes(l.productType, l.ageBand);
    let lineHasPiece = false;

    for (const size of sizes) {
      const quantity = parseQty(l.sizeQuantities[size] ?? "");
      if (quantity < 1) continue;
      lineHasPiece = true;

      const selection = {
        productType: l.productType,
        ageBand: l.ageBand,
        brandId: l.brandId,
        size,
        colorId: l.colorId,
        productionProcess: normalizeProductionProcessForColor(
          l.colorId,
          l.productionProcess,
        ),
      };
      const v = validateApparelLine(selection);
      if (v) {
        return { ok: false, message: `Artigo ${idx + 1} (${size}): ${v}` };
      }

      const variant = findCatalogVariantForSelection(catalog, selection);
      if (!variant) {
        return {
          ok: false,
          message: `Artigo ${idx + 1} (${size}): esta combinação não está disponível no catálogo. Ajusta cor, processo, modelo ou tamanho — o preço não pode ser definido manualmente.`,
        };
      }
      items.push({ productVariantId: variant.id, quantity });
    }

    if (!lineHasPiece) {
      return {
        ok: false,
        message: `Artigo ${idx + 1}: indica quantidade em pelo menos um tamanho.`,
      };
    }
  }

  return { ok: true, items };
}

export function estimateArtigosSubtotal(
  lines: LineForm[],
  catalog: CatalogProduct[] | null | undefined,
): { total: number; currency: string } {
  if (!catalog?.length) return { total: 0, currency: "AOA" };
  let total = 0;
  let currency = "AOA";
  for (const line of lines) {
    const sizes = allowedSizes(line.productType, line.ageBand);
    for (const size of sizes) {
      const quantity = parseQty(line.sizeQuantities[size] ?? "");
      if (quantity < 1) continue;
      const variant = findCatalogVariantForSelection(catalog, {
        productType: line.productType,
        ageBand: line.ageBand,
        brandId: line.brandId,
        size,
        colorId: line.colorId,
        productionProcess: normalizeProductionProcessForColor(
          line.colorId,
          line.productionProcess,
        ),
      });
      if (!variant) continue;
      if (variant.currency) currency = variant.currency;
      const unit =
        typeof variant.unitPrice === "number"
          ? variant.unitPrice
          : parseFloat(String(variant.unitPrice).replace(",", ".")) || 0;
      total += unit * quantity;
    }
  }
  return { total, currency };
}
