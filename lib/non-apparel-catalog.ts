/**
 * Matrizes de variantes para canecas e impressão plana (Fase 3).
 */
import type { CatalogFamily } from "@/lib/product-catalog";

export type NonApparelProductCode =
  | "CANECA"
  | "CARTAO-VISITA"
  | "PASSE-PVC";

export type NonApparelVariantRow = {
  sku: string;
  size: string;
  baseColor: string | null;
  unitPrice: number;
  metadata?: Record<string, unknown>;
};

const CANECA_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "branca", label: "Branca", hex: "#f2f2f2" },
  { id: "preta", label: "Preta", hex: "#1a1a1a" },
  { id: "vermelha", label: "Vermelha", hex: "#c0392b" },
  { id: "azul", label: "Azul", hex: "#2980b9" },
];

const CANECA_CAPACITIES = [
  { id: "325", label: "325 ml", price: 3500 },
  { id: "450", label: "450 ml", price: 4500 },
] as const;

export function buildCanecaVariantMatrix(productCode = "CANECA"): NonApparelVariantRow[] {
  const rows: NonApparelVariantRow[] = [];
  for (const color of CANECA_COLORS) {
    for (const cap of CANECA_CAPACITIES) {
      rows.push({
        sku: `${productCode}-${color.id.toUpperCase()}-${cap.id}-SUB`,
        size: cap.label,
        baseColor: color.id,
        unitPrice: cap.price,
        metadata: { capacityMl: Number(cap.id), colorHex: color.hex },
      });
    }
  }
  return rows;
}

export function buildCartaoVisitaVariantMatrix(
  productCode = "CARTAO-VISITA",
): NonApparelVariantRow[] {
  const formats = [
    { id: "90X50", label: "90×50 mm", aspect: 90 / 50 },
    { id: "85X55", label: "85×55 mm", aspect: 85 / 55 },
  ];
  const finishes = [
    { id: "MATE", label: "Mate", price: 12000 },
    { id: "BRILHO", label: "Brilho", price: 14000 },
  ];
  const rows: NonApparelVariantRow[] = [];
  for (const fmt of formats) {
    for (const fin of finishes) {
      rows.push({
        sku: `${productCode}-${fmt.id}-${fin.id}`,
        size: `${fmt.label} · ${fin.label} · 100 un`,
        baseColor: null,
        unitPrice: fin.price,
        metadata: {
          format: fmt.id,
          finish: fin.id,
          aspect: fmt.aspect,
          packQty: 100,
        },
      });
    }
  }
  return rows;
}

export function buildPassePvcVariantMatrix(
  productCode = "PASSE-PVC",
): NonApparelVariantRow[] {
  const variants = [
    { id: "CR80-BRILHO", label: "CR80 · Laminado brilho", price: 2800 },
    { id: "CR80-MATE", label: "CR80 · Laminado mate", price: 2600 },
    { id: "CR80-SEMI", label: "CR80 · Sem laminação", price: 2200 },
  ];
  return variants.map((v) => ({
    sku: `${productCode}-${v.id}`,
    size: v.label,
    baseColor: null,
    unitPrice: v.price,
    metadata: { format: "CR80", aspect: 85.6 / 54 },
  }));
}

export function nonApparelVariantMatrixForCode(
  productCode: string,
): NonApparelVariantRow[] | null {
  const c = productCode.trim().toUpperCase();
  if (c === "CANECA") return buildCanecaVariantMatrix(c);
  if (c === "CARTAO-VISITA") return buildCartaoVisitaVariantMatrix(c);
  if (c === "PASSE-PVC") return buildPassePvcVariantMatrix(c);
  return null;
}

export function supportsNonApparelMatrix(productCode: string): boolean {
  return nonApparelVariantMatrixForCode(productCode) != null;
}

export function nonApparelCatalogFamilies(): CatalogFamily[] {
  return ["CANECA", "IMPRESSAO_PLANA"];
}

export function isNonApparelOrderFamily(
  family: CatalogFamily | string | null | undefined,
): boolean {
  return family === "CANECA" || family === "IMPRESSAO_PLANA";
}

/** Cor hex para mockup de caneca a partir do id de cor ou metadata. */
export function mugColorHexFromVariant(
  baseColor: string | null | undefined,
  metadata?: unknown,
): string {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const fromMeta = meta?.colorHex;
  if (typeof fromMeta === "string" && fromMeta.startsWith("#")) return fromMeta;
  const id = (baseColor ?? "").trim().toLowerCase();
  const hit = CANECA_COLORS.find((c) => c.id === id);
  return hit?.hex ?? "#f2f2f2";
}

/** Proporção largura/altura para artboard de impressão plana. */
export function flatAspectFromProductCode(
  productCode: string | null | undefined,
  metadata?: unknown,
): number {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const aspect = meta?.aspect;
  if (typeof aspect === "number" && aspect > 0) return aspect;
  const c = (productCode ?? "").trim().toUpperCase();
  if (c === "PASSE-PVC") return 85.6 / 54;
  if (c === "CARTAO-VISITA") return 90 / 50;
  return 90 / 50;
}
