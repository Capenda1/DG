import type { ApparelProductType } from "./apparel-catalog";
import { APPAREL_PRODUCT_TYPES } from "./apparel-catalog";

const KNOWN = new Set<string>(
  APPAREL_PRODUCT_TYPES.map((x) => x.id),
);

function stripForKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .replace(/\.+/g, "_");
}

/**
 * Alias comuns ou legados (texto livre no Admin antes do select).
 * Valores sempre canónicos igual a `ApparelProductType`.
 */
const ALIAS_TO_ID: Partial<Record<string, ApparelProductType>> = {
  T_SHIRT: "T_SHIRT",
  TSHIRT: "T_SHIRT",
  TEE: "T_SHIRT",
  TS: "T_SHIRT",
  CAMISA: "T_SHIRT",
  CAMISETA: "T_SHIRT",
  CAMISOLA: "T_SHIRT",
  TOPS: "T_SHIRT",

  POLO: "POLO",

  COLETE: "COLETE",
  VEST: "COLETE",

  BONE: "BONE",
  CAP: "BONE",
  CHAPEU: "BONE",
  HAT: "BONE",

  PERSONALIZADO: "PERSONALIZADO",
  PERS: "PERSONALIZADO",
  CUSTOM: "PERSONALIZADO",

  EQUIPAMENTOS: "EQUIPAMENTOS",
  EQUIPAMENTO: "EQUIPAMENTOS",
  EQUIP: "EQUIPAMENTOS",
};

/**
 * Resolve texto guardado para um `ApparelProductType` quando possível,
 * caso contrário devolve null (valor desconhecido).
 */
export function canonicalApparelGarmentType(
  raw: string | null | undefined,
): ApparelProductType | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;

  const flat = stripForKey(t);
  if (!flat) return null;

  if (KNOWN.has(flat)) return flat as ApparelProductType;

  const fromAlias = ALIAS_TO_ID[flat];
  if (fromAlias) return fromAlias;

  const first = flat.split("_")[0] ?? "";
  if (KNOWN.has(first)) return first as ApparelProductType;
  const fromFirstAlias = ALIAS_TO_ID[first];
  return fromFirstAlias ?? null;
}

/**
 * Texto para UI: label do catálogo quando o código é reconhecido, senão o valor cru.
 */
export function labelForDesignTemplateGarment(
  garmentType: string | null | undefined,
): string | null {
  if (garmentType == null || !garmentType.trim()) return null;
  const c = canonicalApparelGarmentType(garmentType);
  if (c) {
    const row = APPAREL_PRODUCT_TYPES.find((p) => p.id === c);
    return row?.label ?? c;
  }
  return garmentType.trim();
}

/**
 * Se o template não restringe peça (`garmentType` vazio), combina com qualquer pedido.
 * Caso contrário compara códigos canónicos (pedido usa `ApparelProductType`).
 */
export function designTemplateGarmentMatchesOrder(
  templateGarment: string | null | undefined,
  orderProductType: string | null | undefined,
): boolean {
  if (!templateGarment?.trim()) return true;

  const tpl = canonicalApparelGarmentType(templateGarment);
  const ord = canonicalApparelGarmentType(orderProductType);

  if (tpl && ord) return tpl === ord;

  return stripForKey(templateGarment) === stripForKey(orderProductType ?? "");
}
