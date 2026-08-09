/**
 * Defaults de modelos de catálogo — manter alinhado com `lib/product-catalog.ts`.
 */
export type CatalogFamily =
  | 'VESTUARIO'
  | 'CANECA'
  | 'IMPRESSAO_PLANA'
  | 'SERVICO'
  | 'GENERICO';

export type ApparelGarmentType =
  | 'T_SHIRT'
  | 'POLO'
  | 'COLETE'
  | 'BONE'
  | 'PERSONALIZADO'
  | 'EQUIPAMENTOS';

export type ProductCatalogTemplate = {
  id: string;
  catalogFamily: CatalogFamily;
  code: string;
  name: string;
  hint: string;
  accent: string;
  garmentType?: ApparelGarmentType;
  sortOrder: number;
  active: boolean;
};

export const LEGACY_VESTUARIO_PRODUCT_CODES: readonly string[] = [
  'TSHIRT-CLASSIC',
  'POLO-LACOST',
  'COLETE',
  'BONE-REDE',
  'PERSONALIZADO',
  'EQUIPAMENTOS',
];

export const DEFAULT_PRODUCT_CATALOG_TEMPLATES: ProductCatalogTemplate[] = [
  {
    id: 'tpl-tshirt-classic',
    catalogFamily: 'VESTUARIO',
    code: 'TSHIRT-CLASSIC',
    name: 'T-shirt Postelan',
    hint: 'Base para sublimação / DTF',
    accent: 'from-violet-500/20 to-fuchsia-500/10',
    garmentType: 'T_SHIRT',
    sortOrder: 0,
    active: true,
  },
  {
    id: 'tpl-polo-lacost',
    catalogFamily: 'VESTUARIO',
    code: 'POLO-LACOST',
    name: 'Polo (Lacost)',
    hint: 'Gola tipo polo',
    accent: 'from-emerald-500/20 to-teal-500/10',
    garmentType: 'POLO',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'tpl-colete',
    catalogFamily: 'VESTUARIO',
    code: 'COLETE',
    name: 'Colete',
    hint: 'Adulto, tamanhos amplos',
    accent: 'from-amber-500/25 to-orange-500/10',
    garmentType: 'COLETE',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'tpl-bone-rede',
    catalogFamily: 'VESTUARIO',
    code: 'BONE-REDE',
    name: 'Boné (com / sem rede)',
    hint: 'Tamanho único · grade com rede e sem rede',
    accent: 'from-sky-500/20 to-indigo-500/10',
    garmentType: 'BONE',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'tpl-vestuario-personalizado',
    catalogFamily: 'VESTUARIO',
    code: 'PERSONALIZADO',
    name: 'Personalizado',
    hint: 'Peça personalizada · grade completa',
    accent: 'from-pink-500/20 to-purple-500/10',
    garmentType: 'PERSONALIZADO',
    sortOrder: 4,
    active: true,
  },
  {
    id: 'tpl-vestuario-equipamentos',
    catalogFamily: 'VESTUARIO',
    code: 'EQUIPAMENTOS',
    name: 'Equipamentos',
    hint: 'Equipamentos personalizáveis · grade completa',
    accent: 'from-lime-500/20 to-emerald-500/10',
    garmentType: 'EQUIPAMENTOS',
    sortOrder: 5,
    active: true,
  },
  {
    id: 'tpl-caneca',
    catalogFamily: 'CANECA',
    code: 'CANECA',
    name: 'Canecas',
    hint: 'Sublimação em cerâmica',
    accent: 'from-rose-500/20 to-orange-500/10',
    sortOrder: 10,
    active: true,
  },
  {
    id: 'tpl-cartao-visita',
    catalogFamily: 'IMPRESSAO_PLANA',
    code: 'CARTAO-VISITA',
    name: 'Cartão de Visita',
    hint: 'Formatos e acabamentos',
    accent: 'from-indigo-500/20 to-blue-500/10',
    sortOrder: 11,
    active: true,
  },
  {
    id: 'tpl-passe-pvc',
    catalogFamily: 'IMPRESSAO_PLANA',
    code: 'PASSE-PVC',
    name: 'Carimbo / Passe PVC',
    hint: 'CR80, laminado',
    accent: 'from-cyan-500/20 to-teal-500/10',
    sortOrder: 12,
    active: true,
  },
  {
    id: 'tpl-lona',
    catalogFamily: 'IMPRESSAO_PLANA',
    code: 'LONA',
    name: 'Lona',
    hint: 'Grande formato · preço por m² (altura × largura)',
    accent: 'from-orange-500/20 to-amber-500/10',
    sortOrder: 13,
    active: true,
  },
  {
    id: 'tpl-vinil',
    catalogFamily: 'IMPRESSAO_PLANA',
    code: 'VINIL',
    name: 'Vinil',
    hint: 'Grande formato · preço por m² (altura × largura)',
    accent: 'from-lime-500/20 to-green-500/10',
    sortOrder: 14,
    active: true,
  },
  {
    id: 'tpl-personalizacao',
    catalogFamily: 'SERVICO',
    code: 'PERSONALIZACAO',
    name: 'Personalização',
    hint: 'Montagem de arte, alterações',
    accent: 'from-zinc-500/25 to-slate-600/10',
    sortOrder: 20,
    active: true,
  },
];

const VALID_FAMILIES = new Set<CatalogFamily>([
  'VESTUARIO',
  'CANECA',
  'IMPRESSAO_PLANA',
  'SERVICO',
  'GENERICO',
]);

export function normalizeCatalogTemplates(raw: unknown): ProductCatalogTemplate[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PRODUCT_CATALOG_TEMPLATES];
  const out: ProductCatalogTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? '').trim();
    const code = String(o.code ?? '').trim();
    const name = String(o.name ?? '').trim();
    const catalogFamily = String(o.catalogFamily ?? '').trim() as CatalogFamily;
    if (!id || !code || !name || !VALID_FAMILIES.has(catalogFamily)) continue;
    const gt = o.garmentType;
    const garmentType =
      gt === 'T_SHIRT' ||
      gt === 'POLO' ||
      gt === 'COLETE' ||
      gt === 'BONE' ||
      gt === 'PERSONALIZADO' ||
      gt === 'EQUIPAMENTOS'
        ? gt
        : undefined;
    out.push({
      id,
      catalogFamily,
      code,
      name,
      hint: String(o.hint ?? '').trim(),
      accent: String(o.accent ?? '').trim() || 'from-slate-500/30 to-zinc-600/15',
      garmentType,
      sortOrder: Number.isFinite(Number(o.sortOrder))
        ? Number(o.sortOrder)
        : out.length,
      active: o.active !== false,
    });
  }
  return out.length > 0
    ? out.sort((a, b) => a.sortOrder - b.sortOrder)
    : [...DEFAULT_PRODUCT_CATALOG_TEMPLATES];
}

export function mergeWithDefaultCatalogTemplates(
  stored: ProductCatalogTemplate[],
): ProductCatalogTemplate[] {
  const byId = new Map(stored.map((t) => [t.id, t]));
  for (const def of DEFAULT_PRODUCT_CATALOG_TEMPLATES) {
    if (!byId.has(def.id)) byId.set(def.id, def);
  }
  return [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export const PRODUCT_CATALOG_TEMPLATES_KEY = 'product_catalog_templates';
