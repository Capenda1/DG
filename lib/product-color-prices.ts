/**
 * Preços por cor no produto (sempre AOA).
 * — Legado: `{ [colorId]: … }` (uma grelha; `adult`/`child` aplicam-se a ambos os processos).
 * — Por marca: `{ [marcaAdulto]: { [colorId]: … } }`.
 * — Por processo: cada cor pode ter `sublimation` e `dtf` com `{ adult?, child? }`;
 *   se faltar o bloco do processo, usam-se `adult`/`child` no topo (legado).
 */

import {
  APPAREL_COLORS,
  allowedBrands,
  buildApparelCatalogVariantMatrix,
  isApparelCatalogColorId,
  isColorPriceBrandTopLevelKey,
  type ApparelAgeBand,
  type ApparelBrandId,
  type ApparelColorId,
  type ApparelProductType,
  type ProductionProcess,
} from "@/lib/apparel-catalog";

export type ProductColorBand = {
  adult?: number;
  child?: number;
};

export type ProductColorPriceEntry = {
  adult?: number;
  child?: number;
  sublimation?: ProductColorBand;
  dtf?: ProductColorBand;
};

/** Mapa cor → preços. */
export type ProductColorPricesMap = Record<string, ProductColorPriceEntry>;

export type ParsedColorPrices = {
  legacyByColor: ProductColorPricesMap | null;
  byAdultBrand: Record<string, ProductColorPricesMap>;
};

export type ColorPriceFormRow = {
  subAdult: string;
  subChild: string;
  dtfAdult: string;
  dtfChild: string;
};

function readBand(
  x: unknown,
): { adult?: number; child?: number } | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const b = x as Record<string, unknown>;
  const adult =
    typeof b.adult === "number" && Number.isFinite(b.adult)
      ? b.adult
      : undefined;
  const child =
    typeof b.child === "number" && Number.isFinite(b.child)
      ? b.child
      : undefined;
  if (adult === undefined && child === undefined) return undefined;
  return { adult, child };
}

function parseColorPriceEntry(v: unknown): ProductColorPriceEntry | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: ProductColorPriceEntry = {};
  const topAdult =
    typeof o.adult === "number" && Number.isFinite(o.adult)
      ? o.adult
      : undefined;
  const topChild =
    typeof o.child === "number" && Number.isFinite(o.child)
      ? o.child
      : undefined;
  if (topAdult !== undefined) out.adult = topAdult;
  if (topChild !== undefined) out.child = topChild;
  const sub = readBand(o.sublimation);
  if (sub) out.sublimation = sub;
  const dtf = readBand(o.dtf);
  if (dtf) out.dtf = dtf;
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

function entryHasAnyPrice(e: ProductColorPriceEntry): boolean {
  if (e.adult !== undefined || e.child !== undefined) return true;
  if (e.sublimation?.adult !== undefined || e.sublimation?.child !== undefined) {
    return true;
  }
  if (e.dtf?.adult !== undefined || e.dtf?.child !== undefined) return true;
  return false;
}

function parseColorPriceMap(raw: Record<string, unknown>): ProductColorPricesMap {
  const out: ProductColorPricesMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const e = parseColorPriceEntry(v);
    if (e && entryHasAnyPrice(e)) out[k] = e;
  }
  return out;
}

/** @deprecated heuristic — só para JSON muito antigo misturado. */
function isDirectLegacyScalarEntry(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const onlyTop =
    typeof o.adult === "number" || typeof o.child === "number";
  const hasNested =
    o.sublimation !== undefined || o.dtf !== undefined;
  return onlyTop && !hasNested;
}

export function parseProductColorPrices(raw: unknown): ParsedColorPrices {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { legacyByColor: {}, byAdultBrand: {} };
  }
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0) {
    return { legacyByColor: {}, byAdultBrand: {} };
  }

  const allColorKeys = keys.every((k) => isApparelCatalogColorId(k));
  if (allColorKeys) {
    return {
      legacyByColor: parseColorPriceMap(o),
      byAdultBrand: {},
    };
  }

  const allBrandKeys = keys.every((k) => isColorPriceBrandTopLevelKey(k));
  if (allBrandKeys) {
    const byAdultBrand: Record<string, ProductColorPricesMap> = {};
    for (const [bk, bv] of Object.entries(o)) {
      if (!bv || typeof bv !== "object" || Array.isArray(bv)) continue;
      const inner = parseColorPriceMap(bv as Record<string, unknown>);
      if (Object.keys(inner).length > 0) {
        byAdultBrand[bk] = inner;
      }
    }
    return { legacyByColor: null, byAdultBrand };
  }

  let anyDirect = false;
  for (const v of Object.values(o)) {
    if (isDirectLegacyScalarEntry(v)) {
      anyDirect = true;
      break;
    }
  }
  if (anyDirect) {
    return {
      legacyByColor: parseColorPriceMap(o),
      byAdultBrand: {},
    };
  }

  const byAdultBrand: Record<string, ProductColorPricesMap> = {};
  for (const [bk, bv] of Object.entries(o)) {
    if (!bv || typeof bv !== "object" || Array.isArray(bv)) continue;
    const inner = parseColorPriceMap(bv as Record<string, unknown>);
    if (Object.keys(inner).length > 0) {
      byAdultBrand[bk] = inner;
    }
  }
  return { legacyByColor: null, byAdultBrand };
}

function entryForColor(
  map: ProductColorPricesMap,
  colorId: ApparelColorId,
): ProductColorPriceEntry | undefined {
  const id = String(colorId);
  return map[id] ?? map[id.toLowerCase()] ?? map[id.toUpperCase()];
}

export function priceAnchorBrand(
  garmentType: ApparelProductType,
  variantBrandId: ApparelBrandId,
  ageBand: ApparelAgeBand,
): ApparelBrandId {
  if (ageBand === "ADULT") return variantBrandId;
  if (garmentType === "POLO") {
    if (variantBrandId === "POLO_LACOST_PESADA_CHILD") {
      return "POLO_LACOST_PESADA";
    }
    if (variantBrandId === "POLO_LACOST_LEVE_CHILD") {
      return "POLO_LACOST_LEVE";
    }
  }
  if (
    garmentType === "T_SHIRT" ||
    garmentType === "PERSONALIZADO" ||
    garmentType === "EQUIPAMENTOS"
  ) {
    return "BUK_MAX_PESADA";
  }
  return variantBrandId;
}

function pickPriceForProcess(
  e: ProductColorPriceEntry,
  ageBand: ApparelAgeBand,
  productionProcess: ProductionProcess,
): number | null {
  const band = ageBand === "CHILD" ? "child" : "adult";
  const procBlock =
    productionProcess === "DTF" ? e.dtf : e.sublimation;
  const n1 = procBlock?.[band];
  if (n1 !== undefined && Number.isFinite(n1) && n1 >= 0) return n1;
  const n2 = band === "child" ? e.child : e.adult;
  if (n2 !== undefined && Number.isFinite(n2) && n2 >= 0) return n2;
  return null;
}

function lookupPriceEntry(
  parsed: ParsedColorPrices,
  anchorBrand: ApparelBrandId,
  colorId: ApparelColorId,
): ProductColorPriceEntry | undefined {
  const bKey = String(anchorBrand);
  const colorMaps = parsed.byAdultBrand[bKey];
  if (colorMaps && Object.keys(colorMaps).length > 0) {
    const e = entryForColor(colorMaps, colorId);
    if (e && entryHasAnyPrice(e)) return e;
  }
  if (parsed.legacyByColor && Object.keys(parsed.legacyByColor).length > 0) {
    const e = entryForColor(parsed.legacyByColor, colorId);
    if (e && entryHasAnyPrice(e)) return e;
  }
  return undefined;
}

export function resolveColorUnitPrice(
  parsed: ParsedColorPrices,
  garmentType: ApparelProductType,
  colorId: ApparelColorId,
  ageBand: ApparelAgeBand,
  brandId: ApparelBrandId,
  productionProcess: ProductionProcess,
): number | null {
  const anchor = priceAnchorBrand(garmentType, brandId, ageBand);
  const e = lookupPriceEntry(parsed, anchor, colorId);
  if (!e) return null;
  return pickPriceForProcess(e, ageBand, productionProcess);
}

export function uniformColorPricesForGarment(
  adult: number,
  child: number | undefined,
  garmentType: ApparelProductType,
): Record<string, ProductColorPricesMap> {
  const useChild =
    child !== undefined &&
    Number.isFinite(child) &&
    child >= 0 &&
    garmentType !== "COLETE" &&
    garmentType !== "BONE";
  const out: Record<string, ProductColorPricesMap> = {};
  const band: ProductColorPriceEntry = useChild
    ? { adult, child: child! }
    : { adult };
  for (const b of allowedBrands(garmentType, "ADULT")) {
    const m: ProductColorPricesMap = {};
    for (const c of APPAREL_COLORS) {
      m[c.id] = { ...band };
    }
    out[b.id] = m;
  }
  return out;
}

export function colorPricesMissingForMatrix(
  parsed: ParsedColorPrices,
  garmentType: ApparelProductType,
  includeChildSizes: boolean,
): string | null {
  const rows = buildApparelCatalogVariantMatrix(garmentType, {
    includeChildSizes,
  });
  for (const row of rows) {
    if (
      resolveColorUnitPrice(
        parsed,
        garmentType,
        row.colorId,
        row.ageBand,
        row.brandId,
        row.productionProcess,
      ) === null
    ) {
      const proc = row.productionProcess === "DTF" ? "DTF" : "Sublimação";
      return `Falta preço ${
        row.ageBand === "CHILD" ? "infantil" : "adulto"
      } (${proc}) para «${row.colorId}» · ${row.brandId} (Preços / esta grade).`;
    }
  }
  return null;
}

function entryToFormRow(
  e: ProductColorPriceEntry | undefined,
  showChild: boolean,
): ColorPriceFormRow {
  const subA = e?.sublimation?.adult ?? e?.adult;
  const subC = e?.sublimation?.child ?? e?.child;
  const dtfA = e?.dtf?.adult ?? e?.adult;
  const dtfC = e?.dtf?.child ?? e?.child;
  return {
    subAdult: subA !== undefined ? String(subA) : "",
    subChild: showChild && subC !== undefined ? String(subC) : "",
    dtfAdult: dtfA !== undefined ? String(dtfA) : "",
    dtfChild: showChild && dtfC !== undefined ? String(dtfC) : "",
  };
}

function emptyProcessRowStringsFromMap(
  map: ProductColorPricesMap | null | undefined,
  showChild: boolean,
): Record<string, ColorPriceFormRow> {
  const o: Record<string, ColorPriceFormRow> = {};
  for (const c of APPAREL_COLORS) {
    const e = map ? entryForColor(map, c.id) : undefined;
    o[c.id] = entryToFormRow(e, showChild);
  }
  return o;
}

export function seedRowsByAdultBrandFromProduct(
  garmentType: ApparelProductType,
  colorPricesRaw: unknown,
): Record<string, Record<string, ColorPriceFormRow>> {
  const parsed = parseProductColorPrices(colorPricesRaw);
  const legacy =
    parsed.legacyByColor && Object.keys(parsed.legacyByColor).length > 0
      ? parsed.legacyByColor
      : null;
  const showChild = garmentType !== "COLETE" && garmentType !== "BONE";
  const out: Record<string, Record<string, ColorPriceFormRow>> = {};
  for (const b of allowedBrands(garmentType, "ADULT")) {
    const fromBrand = parsed.byAdultBrand[b.id];
    const src =
      fromBrand && Object.keys(fromBrand).length > 0 ? fromBrand : legacy;
    out[b.id] = emptyProcessRowStringsFromMap(src, showChild);
  }
  return out;
}

function formRowToEntry(
  r: ColorPriceFormRow,
  showChild: boolean,
): ProductColorPriceEntry | undefined {
  const subA = parseFloat(String(r.subAdult).replace(",", "."));
  const subC = parseFloat(String(r.subChild).replace(",", "."));
  const dtfA = parseFloat(String(r.dtfAdult).replace(",", "."));
  const dtfC = parseFloat(String(r.dtfChild).replace(",", "."));
  const entry: ProductColorPriceEntry = {};
  const sub: ProductColorBand = {};
  const dtf: ProductColorBand = {};
  if (Number.isFinite(subA) && subA >= 0) sub.adult = subA;
  if (showChild && Number.isFinite(subC) && subC >= 0) sub.child = subC;
  if (Number.isFinite(dtfA) && dtfA >= 0) dtf.adult = dtfA;
  if (showChild && Number.isFinite(dtfC) && dtfC >= 0) dtf.child = dtfC;
  if (sub.adult !== undefined || sub.child !== undefined) {
    entry.sublimation = sub;
  }
  if (dtf.adult !== undefined || dtf.child !== undefined) {
    entry.dtf = dtf;
  }
  const sameAdult =
    entry.sublimation?.adult !== undefined &&
    entry.dtf?.adult !== undefined &&
    entry.sublimation.adult === entry.dtf.adult;
  const sameChild =
    !showChild ||
    (entry.sublimation?.child !== undefined &&
      entry.dtf?.child !== undefined &&
      entry.sublimation.child === entry.dtf.child);
  if (
    sameAdult &&
    sameChild &&
    entry.sublimation &&
    entry.dtf &&
    Object.keys(entry).length === 2
  ) {
    const compact: ProductColorPriceEntry = {};
    if (entry.sublimation.adult !== undefined) {
      compact.adult = entry.sublimation.adult;
    }
    if (showChild && entry.sublimation.child !== undefined) {
      compact.child = entry.sublimation.child;
    }
    return Object.keys(compact).length > 0 ? compact : undefined;
  }
  if (Object.keys(entry).length === 0) return undefined;
  return entry;
}

export function buildColorPricesPayloadFromForm(
  adultBrandOptions: { id: ApparelBrandId }[],
  rowsByBrand: Record<string, Record<string, ColorPriceFormRow>>,
  showChild: boolean,
): Record<string, ProductColorPricesMap> {
  const m: Record<string, ProductColorPricesMap> = {};
  for (const b of adultBrandOptions) {
    const inner: ProductColorPricesMap = {};
    const state = rowsByBrand[b.id] ?? {};
    for (const c of APPAREL_COLORS) {
      const r = state[c.id] ?? {
        subAdult: "",
        subChild: "",
        dtfAdult: "",
        dtfChild: "",
      };
      const entry = formRowToEntry(r, showChild);
      if (entry) inner[c.id] = entry;
    }
    if (Object.keys(inner).length > 0) {
      m[b.id] = inner;
    }
  }
  return m;
}
