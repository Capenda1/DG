/**
 * Famílias de catálogo e modelos editáveis (admin produtos).
 * Alinhar defaults com `product-catalog.defaults.ts` no backend.
 */
import type { ApparelProductType } from "@/lib/apparel-catalog";

export type CatalogFamily =
  | "VESTUARIO"
  | "CANECA"
  | "IMPRESSAO_PLANA"
  | "SERVICO"
  | "GENERICO";

export const CATALOG_FAMILIES: {
  id: CatalogFamily;
  label: string;
  short: string;
  description: string;
}[] = [
  {
    id: "VESTUARIO",
    label: "Vestuário",
    short: "Vestuário",
    description: "Matriz cor × tamanho × marca × processo",
  },
  {
    id: "CANECA",
    label: "Canecas",
    short: "Canecas",
    description: "Variantes por cor, capacidade ou acabamento",
  },
  {
    id: "IMPRESSAO_PLANA",
    label: "Impressão plana",
    short: "Impressão",
    description: "Cartões, passes PVC, flyers, etc.",
  },
  {
    id: "SERVICO",
    label: "Serviços",
    short: "Serviço",
    description: "Personalização, montagem de arte, taxas",
  },
  {
    id: "GENERICO",
    label: "Outros",
    short: "Outros",
    description: "SKU e preço livres (equipamentos, consumíveis)",
  },
];

export type ModelagemPreviewKind = "APPAREL" | "MUG" | "FLAT" | "AREA";

export type PricingKind = "FIXED" | "AREA";

export type ProductFamilyConfig = {
  garmentType?: ApparelProductType;
  previewKind?: ModelagemPreviewKind;
  pricingKind?: PricingKind;
  areaUnit?: "M";
};

export type ProductCatalogTemplate = {
  id: string;
  catalogFamily: CatalogFamily;
  code: string;
  name: string;
  hint: string;
  accent: string;
  garmentType?: ApparelProductType;
  sortOrder: number;
  active: boolean;
};

/** Códigos legados de vestuário (pré-`catalogFamily` na BD). */
export const LEGACY_VESTUARIO_PRODUCT_CODES = [
  "TSHIRT-CLASSIC",
  "POLO-LACOST",
  "COLETE",
  "BONE-REDE",
  "PERSONALIZADO",
  "EQUIPAMENTOS",
] as const;

export const DEFAULT_PRODUCT_CATALOG_TEMPLATES: ProductCatalogTemplate[] = [
  {
    id: "tpl-tshirt-classic",
    catalogFamily: "VESTUARIO",
    code: "TSHIRT-CLASSIC",
    name: "T-shirt Postelan",
    hint: "Base para sublimação / DTF",
    accent: "from-violet-500/20 to-fuchsia-500/10",
    garmentType: "T_SHIRT",
    sortOrder: 0,
    active: true,
  },
  {
    id: "tpl-polo-lacost",
    catalogFamily: "VESTUARIO",
    code: "POLO-LACOST",
    name: "Polo (Lacost)",
    hint: "Gola tipo polo",
    accent: "from-emerald-500/20 to-teal-500/10",
    garmentType: "POLO",
    sortOrder: 1,
    active: true,
  },
  {
    id: "tpl-colete",
    catalogFamily: "VESTUARIO",
    code: "COLETE",
    name: "Colete",
    hint: "Adulto, tamanhos amplos",
    accent: "from-amber-500/25 to-orange-500/10",
    garmentType: "COLETE",
    sortOrder: 2,
    active: true,
  },
  {
    id: "tpl-bone-rede",
    catalogFamily: "VESTUARIO",
    code: "BONE-REDE",
    name: "Boné (com / sem rede)",
    hint: "Tamanho único · grade com rede e sem rede",
    accent: "from-sky-500/20 to-indigo-500/10",
    garmentType: "BONE",
    sortOrder: 3,
    active: true,
  },
  {
    id: "tpl-vestuario-personalizado",
    catalogFamily: "VESTUARIO",
    code: "PERSONALIZADO",
    name: "Personalizado",
    hint: "Peça personalizada · grade completa (cores × tamanhos × marcas)",
    accent: "from-pink-500/20 to-purple-500/10",
    garmentType: "PERSONALIZADO",
    sortOrder: 4,
    active: true,
  },
  {
    id: "tpl-vestuario-equipamentos",
    catalogFamily: "VESTUARIO",
    code: "EQUIPAMENTOS",
    name: "Equipamentos",
    hint: "Equipamentos personalizáveis · grade completa (cores × tamanhos × marcas)",
    accent: "from-lime-500/20 to-emerald-500/10",
    garmentType: "EQUIPAMENTOS",
    sortOrder: 5,
    active: true,
  },
  {
    id: "tpl-caneca",
    catalogFamily: "CANECA",
    code: "CANECA",
    name: "Canecas",
    hint: "Sublimação em cerâmica — matriz cor × capacidade",
    accent: "from-rose-500/20 to-orange-500/10",
    sortOrder: 10,
    active: true,
  },
  {
    id: "tpl-cartao-visita",
    catalogFamily: "IMPRESSAO_PLANA",
    code: "CARTAO-VISITA",
    name: "Cartão de Visita",
    hint: "Formatos e acabamentos — variantes por SKU",
    accent: "from-indigo-500/20 to-blue-500/10",
    sortOrder: 11,
    active: true,
  },
  {
    id: "tpl-passe-pvc",
    catalogFamily: "IMPRESSAO_PLANA",
    code: "PASSE-PVC",
    name: "Carimbo / Passe PVC",
    hint: "CR80, laminado, frente/verso",
    accent: "from-cyan-500/20 to-teal-500/10",
    sortOrder: 12,
    active: true,
  },
  {
    id: "tpl-lona",
    catalogFamily: "IMPRESSAO_PLANA",
    code: "LONA",
    name: "Lona",
    hint: "Grande formato · preço por m² (altura × largura)",
    accent: "from-orange-500/20 to-amber-500/10",
    sortOrder: 13,
    active: true,
  },
  {
    id: "tpl-vinil",
    catalogFamily: "IMPRESSAO_PLANA",
    code: "VINIL",
    name: "Vinil",
    hint: "Grande formato · preço por m² (altura × largura)",
    accent: "from-lime-500/20 to-green-500/10",
    sortOrder: 14,
    active: true,
  },
  {
    id: "tpl-personalizacao",
    catalogFamily: "SERVICO",
    code: "PERSONALIZACAO",
    name: "Personalização",
    hint: "Montagem de arte, alterações, taxas de serviço",
    accent: "from-zinc-500/25 to-slate-600/10",
    sortOrder: 20,
    active: true,
  },
];

export const CATALOG_FAMILY_ACCENTS: Record<CatalogFamily, string> = {
  VESTUARIO: "from-fuchsia-500/30 to-violet-600/10",
  CANECA: "from-rose-500/30 to-orange-600/10",
  IMPRESSAO_PLANA: "from-indigo-500/30 to-blue-600/10",
  SERVICO: "from-zinc-500/30 to-slate-600/10",
  GENERICO: "from-slate-500/30 to-zinc-600/15",
};

export const GARMENT_TAB_ACCENTS: Record<ApparelProductType, string> = {
  T_SHIRT: "from-fuchsia-500/30 to-violet-600/10",
  POLO: "from-emerald-500/30 to-teal-600/10",
  COLETE: "from-amber-500/35 to-orange-600/10",
  BONE: "from-sky-500/30 to-indigo-600/10",
  PERSONALIZADO: "from-pink-500/30 to-purple-600/10",
  EQUIPAMENTOS: "from-lime-500/30 to-emerald-600/10",
};

export function mergeWithDefaultCatalogTemplates(
  stored: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  const byId = new Map(stored.map((t) => [t.id, t]));
  for (const def of DEFAULT_PRODUCT_CATALOG_TEMPLATES) {
    if (!byId.has(def.id)) byId.set(def.id, def);
  }
  return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function catalogFamilyLabel(family: CatalogFamily | string): string {
  return (
    CATALOG_FAMILIES.find((f) => f.id === family)?.label ??
    String(family)
  );
}

export function catalogFamilyShortLabel(family: CatalogFamily | string): string {
  return (
    CATALOG_FAMILIES.find((f) => f.id === family)?.short ??
    String(family)
  );
}

export function isVestuarioFamily(family: CatalogFamily | string): boolean {
  return family === "VESTUARIO";
}

export function normalizeCatalogTemplates(
  raw: unknown,
): ProductCatalogTemplate[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PRODUCT_CATALOG_TEMPLATES];
  const out: ProductCatalogTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const code = String(o.code ?? "").trim();
    const name = String(o.name ?? "").trim();
    const catalogFamily = String(o.catalogFamily ?? "").trim() as CatalogFamily;
    if (!id || !code || !name) continue;
    if (!CATALOG_FAMILIES.some((f) => f.id === catalogFamily)) continue;
    const garmentTypeRaw = o.garmentType;
    const garmentType =
      garmentTypeRaw === "T_SHIRT" ||
      garmentTypeRaw === "POLO" ||
      garmentTypeRaw === "COLETE" ||
      garmentTypeRaw === "BONE" ||
      garmentTypeRaw === "PERSONALIZADO" ||
      garmentTypeRaw === "EQUIPAMENTOS"
        ? garmentTypeRaw
        : undefined;
    out.push({
      id,
      catalogFamily,
      code,
      name,
      hint: String(o.hint ?? "").trim(),
      accent:
        String(o.accent ?? "").trim() ||
        CATALOG_FAMILY_ACCENTS[catalogFamily],
      garmentType,
      sortOrder: Number.isFinite(Number(o.sortOrder))
        ? Number(o.sortOrder)
        : out.length,
      active: o.active !== false,
    });
  }
  return out.length > 0 ? out.sort((a, b) => a.sortOrder - b.sortOrder) : [...DEFAULT_PRODUCT_CATALOG_TEMPLATES];
}

export function activeCatalogTemplates(
  templates: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  return templates.filter((t) => t.active);
}

export function vestuarioCatalogTemplates(
  templates: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  return activeCatalogTemplates(templates).filter(
    (t) => t.catalogFamily === "VESTUARIO" && t.garmentType,
  );
}

export function templateByCode(
  templates: ProductCatalogTemplate[],
  code: string | null | undefined,
): ProductCatalogTemplate | undefined {
  const c = productCodeSafe(code);
  if (!c) return undefined;
  return templates.find((t) => t.code === c);
}

export function isReservedTemplateCode(
  code: string | null | undefined,
  templates: ProductCatalogTemplate[],
): boolean {
  const c = productCodeSafe(code);
  if (!c) return false;
  return activeCatalogTemplates(templates).some((t) => t.code === c);
}

export type ProductCatalogIdentity = {
  code?: string | null;
  catalogFamily?: CatalogFamily | string | null;
  familyConfig?: ProductFamilyConfig | null;
};

function productCodeSafe(code: string | null | undefined): string {
  return String(code ?? "").trim();
}

export function isVestuarioProduct(
  product: ProductCatalogIdentity,
  templates?: ProductCatalogTemplate[],
): boolean {
  const family = product.catalogFamily?.trim();
  if (family) return family === "VESTUARIO";
  if (templates?.length) {
    const tpl = templateByCode(templates, product.code);
    if (tpl) return tpl.catalogFamily === "VESTUARIO";
  }
  return (LEGACY_VESTUARIO_PRODUCT_CODES as readonly string[]).includes(
    productCodeSafe(product.code),
  );
}

export function resolveProductCatalogFamily(
  product: ProductCatalogIdentity,
  templates?: ProductCatalogTemplate[],
): CatalogFamily {
  const family = product.catalogFamily?.trim() as CatalogFamily | undefined;
  if (family && CATALOG_FAMILIES.some((f) => f.id === family)) return family;
  const tpl = templates ? templateByCode(templates, product.code) : undefined;
  if (tpl) return tpl.catalogFamily;
  if (
    (LEGACY_VESTUARIO_PRODUCT_CODES as readonly string[]).includes(
      productCodeSafe(product.code),
    )
  ) {
    return "VESTUARIO";
  }
  const c = productCodeSafe(product.code).toUpperCase();
  if (c === "CANECA") return "CANECA";
  if (c === "CARTAO-VISITA" || c === "PASSE-PVC") return "IMPRESSAO_PLANA";
  if (c === "LONA" || c === "VINIL") return "IMPRESSAO_PLANA";
  if (c === "PERSONALIZACAO") return "SERVICO";
  return "GENERICO";
}

export function resolveGarmentType(
  product: ProductCatalogIdentity,
  templates?: ProductCatalogTemplate[],
): ApparelProductType {
  const fromConfig = product.familyConfig?.garmentType;
  if (
    fromConfig === "T_SHIRT" ||
    fromConfig === "POLO" ||
    fromConfig === "COLETE" ||
    fromConfig === "BONE" ||
    fromConfig === "PERSONALIZADO" ||
    fromConfig === "EQUIPAMENTOS"
  ) {
    return fromConfig;
  }
  const tpl = templates ? templateByCode(templates, product.code) : undefined;
  if (tpl?.garmentType) return tpl.garmentType;
  const c = productCodeSafe(product.code).toUpperCase();
  if (c.includes("BON")) return "BONE";
  if (c.includes("POLO")) return "POLO";
  if (c.includes("COLETE")) return "COLETE";
  if (c.includes("EQUIPAMENT")) return "EQUIPAMENTOS";
  if (c.includes("PERSONALIZADO") || c === "PERS") return "PERSONALIZADO";
  return "T_SHIRT";
}

export function productAccent(
  product: ProductCatalogIdentity,
  templates?: ProductCatalogTemplate[],
): string {
  if (isVestuarioProduct(product, templates)) {
    return GARMENT_TAB_ACCENTS[resolveGarmentType(product, templates)];
  }
  const family = resolveProductCatalogFamily(product, templates);
  const tpl = templates ? templateByCode(templates, product.code) : undefined;
  if (tpl?.accent) return tpl.accent;
  return CATALOG_FAMILY_ACCENTS[family];
}

export function resolvePricingKind(
  product: ProductCatalogIdentity,
): PricingKind {
  const fromConfig = product.familyConfig?.pricingKind;
  if (fromConfig === "AREA" || fromConfig === "FIXED") return fromConfig;
  const c = productCodeSafe(product.code).toUpperCase();
  if (c === "LONA" || c === "VINIL") return "AREA";
  return "FIXED";
}

export function resolvePreviewKind(
  product: ProductCatalogIdentity,
): ModelagemPreviewKind {
  const fromConfig = product.familyConfig?.previewKind;
  if (
    fromConfig === "MUG" ||
    fromConfig === "FLAT" ||
    fromConfig === "APPAREL" ||
    fromConfig === "AREA"
  ) {
    return fromConfig;
  }
  if (resolvePricingKind(product) === "AREA") return "AREA";
  const family = resolveProductCatalogFamily(product);
  if (family === "CANECA") return "MUG";
  if (family === "IMPRESSAO_PLANA") return "FLAT";
  return "APPAREL";
}

export function nonApparelCatalogTemplates(
  templates: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  return activeCatalogTemplates(templates).filter((t) => {
    const c = t.code.trim().toUpperCase();
    if (c === "LONA" || c === "VINIL") return false;
    return (
      t.catalogFamily === "CANECA" || t.catalogFamily === "IMPRESSAO_PLANA"
    );
  });
}

export function areaCatalogTemplates(
  templates: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  return activeCatalogTemplates(templates).filter((t) => {
    const c = t.code.trim().toUpperCase();
    return c === "LONA" || c === "VINIL";
  });
}

export function familyConfigFromTemplate(
  template: ProductCatalogTemplate,
): ProductFamilyConfig | undefined {
  if (template.catalogFamily === "VESTUARIO" && template.garmentType) {
    return { garmentType: template.garmentType };
  }
  const code = template.code.trim().toUpperCase();
  if (code === "LONA" || code === "VINIL") {
    return {
      previewKind: "AREA",
      pricingKind: "AREA",
      areaUnit: "M",
    };
  }
  const previewKind = resolvePreviewKind({
    catalogFamily: template.catalogFamily,
    code: template.code,
  });
  if (previewKind === "MUG" || previewKind === "FLAT") {
    return { previewKind, pricingKind: "FIXED" };
  }
  return undefined;
}

export function newCatalogTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
