/**
 * Catálogo hierárquico Dádiva GO — T-shirt, Polo, Colete, Boné, Personalizado, Equipamentos.
 * Grade: modelo (marca) × cor × tamanho; cores escuras → DTF onde aplicável.
 */

export type ApparelProductType =
  | "T_SHIRT"
  | "POLO"
  | "COLETE"
  | "BONE"
  | "PERSONALIZADO"
  | "EQUIPAMENTOS";
export type ApparelAgeBand = "ADULT" | "CHILD";
export type ProductionProcess = "SUBLIMATION" | "DTF";

export const APPAREL_PRODUCT_TYPES: {
  id: ApparelProductType;
  label: string;
}[] = [
  { id: "T_SHIRT", label: "T-shirt" },
  { id: "POLO", label: "Polo" },
  { id: "COLETE", label: "Colete" },
  { id: "BONE", label: "Boné" },
  { id: "PERSONALIZADO", label: "Personalizado" },
  { id: "EQUIPAMENTOS", label: "Equipamentos" },
];

/** T-shirt adulto: Buk Max (pesada), Buk Nova (normal), PK (leve). */
export type TShirtAdultBrandId =
  | "PK_LEVE"
  | "BUK_NOVA_NORMAL"
  | "BUK_MAX_PESADA";

/** T-shirt infantil Buk Max (pesada). */
export type BukMaxOnly = "BUK_MAX_PESADA";

/** Polo adulto: Lacost pesada ou leve. */
export type PoloAdultBrandId =
  | "POLO_LACOST_PESADA"
  | "POLO_LACOST_LEVE";

/** Polo infantil: Lacost pesada ou leve (par com o adulto). */
export type PoloChildBrandId =
  | "POLO_LACOST_PESADA_CHILD"
  | "POLO_LACOST_LEVE_CHILD";

/** Colete: Normal, Pesado. */
export type ColeteBrandId = "COLETE_NORMAL" | "COLETE_PESADA";

/** Boné: com rede, sem rede. */
export type BoneBrandId = "BONE_COM_REDE" | "BONE_SEM_REDE";

export type ApparelBrandId =
  | TShirtAdultBrandId
  | BukMaxOnly
  | PoloAdultBrandId
  | PoloChildBrandId
  | ColeteBrandId
  | BoneBrandId;

export const T_SHIRT_ADULT_BRANDS: { id: TShirtAdultBrandId; label: string }[] =
  [
    { id: "BUK_MAX_PESADA", label: "Buk Max (pesada)" },
    { id: "BUK_NOVA_NORMAL", label: "Buk Nova (normal)" },
    { id: "PK_LEVE", label: "PK (leve)" },
  ];

export const BUK_MAX_ONLY: { id: BukMaxOnly; label: string }[] = [
  { id: "BUK_MAX_PESADA", label: "Buk Max (pesada)" },
];

export const POLO_ADULT_BRANDS: { id: PoloAdultBrandId; label: string }[] = [
  { id: "POLO_LACOST_PESADA", label: "Lacost (pesada)" },
  { id: "POLO_LACOST_LEVE", label: "Lacost (leve)" },
];

export const POLO_CHILD_BRANDS: { id: PoloChildBrandId; label: string }[] = [
  { id: "POLO_LACOST_PESADA_CHILD", label: "Lacost infantil (pesada)" },
  { id: "POLO_LACOST_LEVE_CHILD", label: "Lacost infantil (leve)" },
];

export const COLETE_BRANDS: { id: ColeteBrandId; label: string }[] = [
  { id: "COLETE_PESADA", label: "Colete pesado" },
  { id: "COLETE_NORMAL", label: "Colete normal" },
];

export const BONE_BRANDS: { id: BoneBrandId; label: string }[] = [
  { id: "BONE_COM_REDE", label: "Boné com rede" },
  { id: "BONE_SEM_REDE", label: "Boné sem rede" },
];

/** Tamanhos adulto (grade oficial). */
export const ADULT_SIZES: string[] = [
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "XXXXL",
];

/** Legado gerado por versões antigas do catálogo (equivale à grade XXL+). */
export const LEGACY_TO_CANONICAL_ADULT_SIZE: Record<string, string> = {
  "2XL": "XXL",
  "3XL": "XXXL",
  "4XL": "XXXXL",
};

export function canonicalAdultSize(size: string): string {
  const t = size.trim();
  return LEGACY_TO_CANONICAL_ADULT_SIZE[t] ?? t;
}

export function sizesMatchForCatalog(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x === y) return true;
  if (canonicalAdultSize(x) === canonicalAdultSize(y)) return true;
  return false;
}

export const CHILD_SIZES: string[] = [
  "1/2",
  "3/4",
  "5/6",
  "7/8",
  "9/10",
  "11/12",
  "13/14",
  "15/16",
];

export type ApparelColorId =
  | "branco"
  | "rosa-bebe"
  | "rosa-carregado"
  | "amarelo"
  | "azul-bebe"
  | "azul-escuro"
  | "azul-lapizeira"
  | "vermelho"
  | "castanho"
  | "leite"
  | "cinza"
  | "verde"
  | "verde-alface"
  | "verde-militar"
  | "laranja"
  | "vinho"
  | "violata"
  | "preta";

/**
 * Cor real do tecido para pré-visualização (sRGB).
 * Calibrada com base nas referências de cor dos fornecedores (PK / Buk).
 * Edita estes valores sempre que receberes uma amostra física nova.
 */
export const APPAREL_COLOR_PREVIEW_HEX: Record<ApparelColorId, string> = {
  branco:            "#f0ede8", // branco algodão (ligeiramente quente, nunca puro)
  "rosa-bebe":       "#f2a8c0", // rosa pastel saturado
  "rosa-carregado":  "#d63878", // rosa carregado / fúcsia
  amarelo:           "#f5c800", // amarelo vivo (sem verde nem laranja)
  "azul-bebe":       "#78b4d8", // azul celeste claro
  "azul-escuro":     "#162840", // azul marinho profundo
  "azul-lapizeira":  "#3860a0", // azul médio / royal blue
  vermelho:          "#cc2830", // vermelho puro sem rosa
  castanho:          "#704020", // castanho médio
  leite:             "#ece4cc", // creme / off-white quente
  cinza:             "#8c9290", // cinza médio neutro
  verde:             "#248040", // verde pinheiro
  "verde-alface":    "#50c060", // verde alface vivo
  "verde-militar":   "#3e4e28", // verde oliva / militar
  laranja:           "#e85818", // laranja vivo
  vinho:             "#6e1830", // vinho / bordeaux escuro
  violata:           "#5030a0", // violeta / roxo médio
  preta:             "#181818", // preto (ligeiramente acima de #000 para ter detalhe)
};

export const APPAREL_COLORS: { id: ApparelColorId; label: string }[] = [
  { id: "branco", label: "Branco" },
  { id: "rosa-bebe", label: "Rosa-bebé" },
  { id: "rosa-carregado", label: "Rosa-carregada" },
  { id: "amarelo", label: "Amarela" },
  { id: "azul-bebe", label: "Azul-bebé" },
  { id: "azul-escuro", label: "Azul-escuro" },
  { id: "azul-lapizeira", label: "Azul-lapizeira" },
  { id: "vermelho", label: "Vermelho" },
  { id: "castanho", label: "Castanho" },
  { id: "leite", label: "Leite" },
  { id: "cinza", label: "Cinza" },
  { id: "verde", label: "Verde" },
  { id: "verde-alface", label: "Verde-alface" },
  { id: "verde-militar", label: "Verde-militar" },
  { id: "laranja", label: "Laranja" },
  { id: "vinho", label: "Vinho" },
  { id: "violata", label: "Violeta" },
  { id: "preta", label: "Preta" },
];

/** Cores que só permitem personalização DTF (revisão de cor). */
const DTF_ONLY_COLOR_IDS = new Set<ApparelColorId>(["preta", "azul-escuro"]);

export function colorRequiresDtfOnly(colorId: ApparelColorId): boolean {
  return DTF_ONLY_COLOR_IDS.has(colorId);
}

export function allowedProcessesForColor(
  colorId: ApparelColorId,
): ProductionProcess[] {
  return colorRequiresDtfOnly(colorId) ? ["DTF"] : ["SUBLIMATION", "DTF"];
}

export function coleteSupportsInfantil(): boolean {
  return false;
}

export function allowedAgeBands(
  productType: ApparelProductType,
): ApparelAgeBand[] {
  if (productType === "COLETE" || productType === "BONE") return ["ADULT"];
  return ["ADULT", "CHILD"];
}

const T_SHIRT_CHILD_BRANDS: { id: BukMaxOnly; label: string }[] = [
  { id: "BUK_MAX_PESADA", label: "Buk Max infantil (pesada)" },
];

const APPAREL_CATALOG_COLOR_ID_SET = new Set(
  APPAREL_COLORS.map((c) => c.id),
);

/** Chaves de 1.º nível em `product.colorPrices` quando organizado por marca. */
export const CATALOG_COLOR_PRICE_BRAND_ID_SET = new Set<string>([
  ...T_SHIRT_ADULT_BRANDS.map((b) => b.id),
  ...T_SHIRT_CHILD_BRANDS.map((b) => b.id),
  ...BUK_MAX_ONLY.map((b) => b.id),
  ...POLO_ADULT_BRANDS.map((b) => b.id),
  ...POLO_CHILD_BRANDS.map((b) => b.id),
  ...COLETE_BRANDS.map((b) => b.id),
  ...BONE_BRANDS.map((b) => b.id),
]);

export function isApparelCatalogColorId(key: string): boolean {
  return APPAREL_CATALOG_COLOR_ID_SET.has(key as ApparelColorId);
}

export function isColorPriceBrandTopLevelKey(key: string): boolean {
  return CATALOG_COLOR_PRICE_BRAND_ID_SET.has(key);
}

export function allowedBrands(
  productType: ApparelProductType,
  ageBand: ApparelAgeBand,
): { id: ApparelBrandId; label: string }[] {
  if (productType === "COLETE") {
    return COLETE_BRANDS;
  }
  if (productType === "BONE") {
    return BONE_BRANDS;
  }
  if (productType === "POLO") {
    return ageBand === "CHILD" ? POLO_CHILD_BRANDS : POLO_ADULT_BRANDS;
  }
  if (
    productType === "T_SHIRT" ||
    productType === "PERSONALIZADO" ||
    productType === "EQUIPAMENTOS"
  ) {
    if (ageBand === "CHILD") {
      return T_SHIRT_CHILD_BRANDS;
    }
    return T_SHIRT_ADULT_BRANDS;
  }
  return T_SHIRT_ADULT_BRANDS;
}

export function allowedSizes(
  productType: ApparelProductType,
  ageBand: ApparelAgeBand,
): string[] {
  if (productType === "BONE") {
    return ["Único"];
  }
  if (productType === "COLETE" && ageBand === "CHILD") {
    return [];
  }
  return ageBand === "ADULT" ? ADULT_SIZES : CHILD_SIZES;
}

export function defaultBrandForSelection(
  productType: ApparelProductType,
  ageBand: ApparelAgeBand,
): ApparelBrandId {
  const opts = allowedBrands(productType, ageBand);
  return opts[0]!.id;
}

export function defaultSizeForSelection(
  productType: ApparelProductType,
  ageBand: ApparelAgeBand,
): string {
  const sizes = allowedSizes(productType, ageBand);
  return sizes[0] ?? "S";
}

export function normalizeProductionProcessForColor(
  colorId: ApparelColorId,
  process: ProductionProcess,
): ProductionProcess {
  if (colorRequiresDtfOnly(colorId) && process === "SUBLIMATION") {
    return "DTF";
  }
  return process;
}

export type ApparelLineSelection = {
  productType: ApparelProductType;
  ageBand: ApparelAgeBand;
  brandId: ApparelBrandId;
  size: string;
  colorId: ApparelColorId;
  productionProcess: ProductionProcess;
};

/** Compatibilidade `metadata.brandId` antigo (polo) com a grade nova. */
export function variantBrandMatchesSelection(
  productType: ApparelProductType,
  selectedBrandId: ApparelBrandId,
  variantMetaBrand: string | null | undefined,
): boolean {
  if (variantMetaBrand == null || variantMetaBrand === "") return true;
  if (variantMetaBrand === selectedBrandId) return true;
  if (productType === "POLO") {
    const meta = variantMetaBrand;
    const sel = selectedBrandId;
    if (
      sel === "POLO_LACOST_PESADA" &&
      (meta === "POLO_LACOST" ||
        meta === "POLO_BUK_MAX" ||
        meta === "BUK_MAX_PESADA")
    ) {
      return true;
    }
    if (sel === "POLO_LACOST_PESADA_CHILD" && meta === "POLO_BUK_MAXA") {
      return true;
    }
  }
  return false;
}

export function variantAgeBandMatchesSelection(
  selAge: ApparelAgeBand,
  size: string,
  variantMetaAge: string | null | undefined,
): boolean {
  const sz = size.trim();
  if (variantMetaAge === "CHILD" || variantMetaAge === "ADULT") {
    return variantMetaAge === selAge;
  }
  if (CHILD_SIZES.includes(sz)) return selAge === "CHILD";
  if (ADULT_SIZES.includes(sz) || sz === "Único") return selAge === "ADULT";
  if (LEGACY_TO_CANONICAL_ADULT_SIZE[sz]) return selAge === "ADULT";
  return true;
}

export function validateApparelLine(
  line: ApparelLineSelection,
): string | null {
  const ages = allowedAgeBands(line.productType);
  if (!ages.includes(line.ageBand)) {
    return "Este tipo de peça não está disponível nesta faixa etária.";
  }
  const brands = allowedBrands(line.productType, line.ageBand);
  if (!brands.some((b) => b.id === line.brandId)) {
    return "A marca escolhida não é válida para este tipo e faixa etária.";
  }
  const sizes = allowedSizes(line.productType, line.ageBand);
  if (!sizes.includes(line.size)) {
    return "O tamanho escolhido não é válido para esta faixa etária.";
  }
  if (!APPAREL_COLORS.some((c) => c.id === line.colorId)) {
    return "Cor inválida.";
  }
  const okProc = allowedProcessesForColor(line.colorId);
  if (!okProc.includes(line.productionProcess)) {
    return "Para preto e azul-escuro só é possível DTF.";
  }
  return null;
}

/** Processo por defeito para catálogo (sublimação quando a cor permitir). */
export function defaultProductionProcessForCatalogColor(
  colorId: ApparelColorId,
): ProductionProcess {
  const opts = allowedProcessesForColor(colorId);
  return opts.includes("SUBLIMATION") ? "SUBLIMATION" : "DTF";
}

/**
 * Processo efectivo para casar variantes (dados antigos sem `productionProcess` na BD).
 * Usa o processo por defeito da cor — necessário para cores só‑DTF e catálogo legado.
 */
export function effectiveVariantProductionProcess(
  stored: string | null | undefined,
  colorId: ApparelColorId,
): ProductionProcess {
  const t = stored?.trim();
  if (t === "SUBLIMATION" || t === "DTF") return t;
  return defaultProductionProcessForCatalogColor(colorId);
}

/** Uma linha da matriz oficial cor × tamanho × faixa etária (para gerar variantes na API). */
export type ApparelCatalogVariantRow = {
  colorId: ApparelColorId;
  size: string;
  ageBand: ApparelAgeBand;
  brandId: ApparelBrandId;
  productionProcess: ProductionProcess;
};

/**
 * Todas as combinações de cores × tamanhos válidos para o tipo de peça,
 * alinhado ao formulário “Novo pedido” (adulto; infantil opcional para T-shirt e Polo).
 */
export function buildApparelCatalogVariantMatrix(
  garmentType: ApparelProductType,
  options: { includeChildSizes: boolean },
): ApparelCatalogVariantRow[] {
  const rows: ApparelCatalogVariantRow[] = [];
  const ageBands: ApparelAgeBand[] =
    garmentType === "COLETE" || garmentType === "BONE"
      ? ["ADULT"]
      : options.includeChildSizes
        ? ["ADULT", "CHILD"]
        : ["ADULT"];

  for (const ageBand of ageBands) {
    const sizes = allowedSizes(garmentType, ageBand);
    if (sizes.length === 0) continue;
    const brands = allowedBrands(garmentType, ageBand);
    for (const brand of brands) {
      for (const color of APPAREL_COLORS) {
        const processes = allowedProcessesForColor(color.id);
        for (const productionProcess of processes) {
          for (const size of sizes) {
            rows.push({
              colorId: color.id,
              size,
              ageBand,
              brandId: brand.id,
              productionProcess,
            });
          }
        }
      }
    }
  }
  return rows;
}

/** Limite imposto pela API (`CreateProductVariantDto.sku`). */
export const ADMIN_VARIANT_SKU_MAX_LENGTH = 64;

/** Códigos curtos de marca — evitam SKUs > 64 com produto + cor longos + sufixo DTF/SUB. */
const BRAND_SKU_CODES: Record<ApparelBrandId, string> = {
  BUK_MAX_PESADA: "BMP",
  BUK_NOVA_NORMAL: "BNN",
  PK_LEVE: "PKL",
  POLO_LACOST_PESADA: "PLP",
  POLO_LACOST_LEVE: "PLL",
  POLO_LACOST_PESADA_CHILD: "PLPC",
  POLO_LACOST_LEVE_CHILD: "PLLC",
  COLETE_NORMAL: "CLN",
  COLETE_PESADA: "CLP",
  BONE_COM_REDE: "BCR",
  BONE_SEM_REDE: "BSR",
};

function slugSkuPart(s: string, maxLen = 24): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

function brandSkuPart(brandId: string): string {
  const key = brandId.trim() as ApparelBrandId;
  const code = BRAND_SKU_CODES[key];
  if (code) return code;
  return slugSkuPart(brandId, 12);
}

function fitAdminVariantSku(sku: string): string {
  if (sku.length <= ADMIN_VARIANT_SKU_MAX_LENGTH) return sku;
  return sku.slice(0, ADMIN_VARIANT_SKU_MAX_LENGTH);
}

/** Prefixo de produto no SKU — omite sufixos genéricos como «-CLASSIC». */
export function productSkuPrefix(productCode: string, maxLen = 14): string {
  const slug = slugSkuPart(productCode, maxLen);
  return slug
    .replace(/-(CLASSIC|CLASSICA)$/, "")
    .replace(/^(CLASSIC|CLASSICA)-/, "");
}

/**
 * SKU estável (produto × cor × tamanho × faixa × marca × processo).
 * O processo por defeito da cor mantém o SKU «clássico» (sem sufixo); o outro
 * processo (quando a cor permite os dois) usa `-SUB` ou `-DTF` para não colidir.
 */
export function buildAdminVariantSku(
  productCode: string,
  row: Pick<
    ApparelCatalogVariantRow,
    "colorId" | "size" | "ageBand" | "brandId" | "productionProcess"
  >,
): string {
  const p = productSkuPrefix(productCode, 14);
  const c = slugSkuPart(row.colorId, 14);
  const s = slugSkuPart(row.size, 8);
  const band = row.ageBand === "CHILD" ? "INF" : "ADL";
  const m = brandSkuPart(row.brandId);
  const base = `${p}-${c}-${s}-${band}-${m}`;
  const def = defaultProductionProcessForCatalogColor(row.colorId);
  if (row.productionProcess === def) {
    return fitAdminVariantSku(base.replace(/-+/g, "-"));
  }
  const tag = row.productionProcess === "DTF" ? "DTF" : "SUB";
  return fitAdminVariantSku(`${base}-${tag}`.replace(/-+/g, "-"));
}

function brandLabel(brandId: ApparelBrandId): string {
  const all = [
    ...T_SHIRT_ADULT_BRANDS,
    ...T_SHIRT_CHILD_BRANDS,
    ...BUK_MAX_ONLY,
    ...POLO_ADULT_BRANDS,
    ...POLO_CHILD_BRANDS,
    ...COLETE_BRANDS,
    ...BONE_BRANDS,
  ] as { id: ApparelBrandId; label: string }[];
  return all.find((b) => b.id === brandId)?.label ?? brandId;
}

/** Label de marca na grade do catálogo (relatórios, UI); id desconhecido devolve o próprio texto. */
export function labelForApparelBrandId(
  brandId: string | null | undefined,
): string {
  if (brandId == null || !String(brandId).trim()) return "";
  return brandLabel(String(brandId).trim() as ApparelBrandId);
}

function typeLabel(type: ApparelProductType): string {
  return APPAREL_PRODUCT_TYPES.find((t) => t.id === type)?.label ?? type;
}

function colorLabel(colorId: ApparelColorId): string {
  return APPAREL_COLORS.find((c) => c.id === colorId)?.label ?? colorId;
}

/** Texto único enviado à API em `productName` (rascunho legível pela gráfica). */
export function buildApparelProductDescription(
  line: ApparelLineSelection,
): string {
  const faixa = line.ageBand === "ADULT" ? "Adulto" : "Infantil";
  const proc =
    line.productionProcess === "DTF" ? "DTF" : "Sublimação";
  return [
    typeLabel(line.productType),
    faixa,
    brandLabel(line.brandId),
    `Tamanho ${line.size}`,
    colorLabel(line.colorId),
    proc,
  ].join(" · ");
}

const DEFAULT_PREVIEW_HEX = "#c8cdd4";

/** Resolve id de cor do catálogo a partir de metadados / `baseColor` da variante. */
export function resolveApparelColorIdFromMeta(
  meta: Record<string, unknown> | null | undefined,
  baseColorFallback?: string | null,
): ApparelColorId | null {
  const candidates: string[] = [];
  if (meta) {
    for (const key of ["colorId", "baseColor"] as const) {
      const v = meta[key];
      if (typeof v === "string" && v.trim()) candidates.push(v.trim());
    }
  }
  if (baseColorFallback?.trim()) candidates.push(baseColorFallback.trim());

  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    const byId = APPAREL_COLORS.find((c) => c.id.toLowerCase() === lower);
    if (byId) return byId.id;
    const byLabel = APPAREL_COLORS.find(
      (c) => c.label.toLowerCase() === lower,
    );
    if (byLabel) return byLabel.id;
  }
  return null;
}

export function apparelColorPreviewHex(
  colorId: ApparelColorId | null | undefined,
): string {
  if (!colorId) return DEFAULT_PREVIEW_HEX;
  return APPAREL_COLOR_PREVIEW_HEX[colorId] ?? DEFAULT_PREVIEW_HEX;
}

/**
 * Hex + rótulo para mockup a partir de metadados do pedido (fonte preferida).
 * Usa `colorId` / `baseColor` — não interpreta `productName`.
 */
export function apparelPreviewColorFromOrderMeta(
  meta: Record<string, unknown> | null | undefined,
): { colorId: ApparelColorId | null; hex: string; label: string | null } {
  const colorId = resolveApparelColorIdFromMeta(meta);
  const hex = apparelColorPreviewHex(colorId);
  const label = colorId
    ? (APPAREL_COLORS.find((c) => c.id === colorId)?.label ?? null)
    : null;
  return { colorId, hex, label };
}

function matchApparelColorToken(token: string): ApparelColorId | undefined {
  const t = token.trim().toLowerCase();
  if (!t) return undefined;
  const byId = APPAREL_COLORS.find((c) => c.id.toLowerCase() === t);
  if (byId) return byId.id;
  return APPAREL_COLORS.find((c) => c.label.toLowerCase() === t)?.id;
}

/** Infere tipo de peça e cor a partir de `productName` (legado / fallback). */
export function previewAppearanceFromProductName(
  productName: string,
): {
  productType: ApparelProductType;
  baseColorHex: string;
  /** Legenda curta para UI (ex.: «T-shirt · Branco»). */
  caption: string;
} {
  const raw = productName.trim();
  if (!raw) {
    return {
      productType: "T_SHIRT",
      baseColorHex: DEFAULT_PREVIEW_HEX,
      caption: "T-shirt",
    };
  }

  let productType: ApparelProductType = "T_SHIRT";
  if (/colete/i.test(raw)) {
    productType = "COLETE";
  } else if (/bon[eé]/i.test(raw)) {
    productType = "BONE";
  } else if (/polo/i.test(raw)) {
    productType = "POLO";
  } else if (/equipamento/i.test(raw)) {
    productType = "EQUIPAMENTOS";
  } else if (/personalizado/i.test(raw)) {
    productType = "PERSONALIZADO";
  }

  const typeLbl =
    APPAREL_PRODUCT_TYPES.find((t) => t.id === productType)?.label ?? "Peça";

  const partsDot = raw.split(" · ").map((p) => p.trim());
  const colorSegmentDot = partsDot.length >= 5 ? partsDot[4]! : "";

  let colorId = matchApparelColorToken(colorSegmentDot);

  /* Formato API: «Colete — vermelho / M» ou «T-shirt — branco / L» */
  if (!colorId) {
    const dashMatch = raw.match(/—\s*([^/]+?)\s*\//);
    if (dashMatch?.[1]) {
      colorId = matchApparelColorToken(dashMatch[1]);
    }
  }

  /* Último recurso: token exacto no texto, ordenado do label mais longo → evita
   * «leite» dentro de «Colete» e «verde» a engolir «verde-militar». */
  if (!colorId) {
    const lower = raw.toLowerCase();
    const sorted = [...APPAREL_COLORS].sort(
      (a, b) => b.label.length - a.label.length || b.id.length - a.id.length,
    );
    for (const c of sorted) {
      const label = c.label.toLowerCase();
      const id = c.id.toLowerCase();
      const labelRe = new RegExp(
        `(^|[^\\p{L}\\p{N}])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^\\p{L}\\p{N}]|$)`,
        "iu",
      );
      const idRe = new RegExp(
        `(^|[^\\p{L}\\p{N}])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^\\p{L}\\p{N}]|$)`,
        "iu",
      );
      if (labelRe.test(lower) || idRe.test(lower)) {
        colorId = c.id;
        break;
      }
    }
  }

  const baseColorHex = apparelColorPreviewHex(colorId ?? null);

  const colorLbl = colorId
    ? APPAREL_COLORS.find((c) => c.id === colorId)?.label
    : undefined;

  const caption = colorLbl ? `${typeLbl} · ${colorLbl}` : typeLbl;

  return { productType, baseColorHex, caption };
}

function receiptBrandLabel(brandId: unknown): string {
  if (brandId == null || !String(brandId).trim()) return "";
  const id = String(brandId).trim();
  if (id === "BUK_MAX_PESADA") return "Buk Max";
  if (id === "BUK_NOVA_NORMAL") return "Buk Nova";
  if (id === "PK_LEVE") return "PK";
  const full = labelForApparelBrandId(id);
  if (!full) return "";
  return full.replace(/\s*\([^)]*\)/g, "").trim() || full;
}

function receiptAgeBandFromMetadata(
  meta: Record<string, unknown>,
): ApparelAgeBand {
  const ab = meta.ageBand;
  if (ab === "CHILD" || ab === "INFANTIL" || ab === "infantil") return "CHILD";
  if (ab === "ADULT" || ab === "ADULTO" || ab === "adulto") return "ADULT";
  const size = typeof meta.size === "string" ? meta.size.trim() : "";
  if (size && CHILD_SIZES.includes(size)) return "CHILD";
  if (size && (ADULT_SIZES.includes(size) || size === "Único")) return "ADULT";
  if (size && LEGACY_TO_CANONICAL_ADULT_SIZE[size]) return "ADULT";
  return "ADULT";
}

function receiptColorLabel(meta: Record<string, unknown>): string {
  const resolved = resolveApparelColorIdFromMeta(meta);
  if (resolved) return colorLabel(resolved);
  const baseColor = meta.baseColor;
  if (typeof baseColor === "string" && baseColor.trim()) {
    return baseColor.trim();
  }
  return "";
}

/** Descrição compacta para factura-recibo (tipo · marca · cor · faixa etária). */
export function receiptLineDescriptionFromOrderItem(
  productName: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return productName;
  }
  if (metadata.pricingKind === "AREA") return productName;
  if (metadata.insumoId != null) return productName;

  const gtRaw = metadata.garmentType;
  if (typeof gtRaw !== "string" || !gtRaw.trim()) return productName;

  const productType = gtRaw.trim() as ApparelProductType;
  if (!APPAREL_PRODUCT_TYPES.some((t) => t.id === productType)) {
    return productName;
  }

  const typeLbl = typeLabel(productType);
  const brandLbl = receiptBrandLabel(metadata.brandId);
  const colorLbl = receiptColorLabel(metadata);
  const faixa =
    receiptAgeBandFromMetadata(metadata) === "CHILD" ? "Infantil" : "Adulto";

  const parts = [typeLbl];
  if (brandLbl) parts.push(brandLbl);
  if (colorLbl) parts.push(colorLbl);
  parts.push(faixa);
  return parts.join(" · ");
}
