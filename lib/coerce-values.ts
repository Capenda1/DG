import { sanitizeUnsignedDecimalString } from "@/lib/numeric-input";

/**
 * Converte valores vindos da API (number, string Decimal JSON, formulários pt)
 * para número finito, ou null se inválido.
 */
export function coerceFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let s = String(value).trim().replace(/\u00a0|\s+/g, "");
  if (!s || s === "-") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  // Estilo europeu: "1.234,56" ou "1234,56"
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma !== -1 && lastDot !== -1 && lastDot > lastComma) {
    // Estilo inglês com milhar: "1,234.56"
    s = s.replace(/,/g, "");
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function coerceMoneyOrZero(value: unknown): number {
  return coerceFiniteNumber(value) ?? 0;
}

/** Mostra contagem inteira (ex.: número de liquidações), pt-AO. */
export function formatIntegerDisplay(
  value: unknown,
  locale: string = "pt-AO",
): string {
  const n = coerceFiniteNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.trunc(n));
}

/** Etiquetas / nomes opcionais: vazio ou null → «—». */
export function formatDisplayText(value: unknown): string {
  if (value == null) return "—";
  const t = String(value).trim();
  return t !== "" ? t : "—";
}

/** Para inputs monetários sincronizados com a API string|number + vírgula decimal. */
export function moneyInputFromUnknown(
  value: unknown,
  maxFractionDigits: number,
): string {
  const n = coerceFiniteNumber(value);
  if (n == null) return "";
  const fixed = n.toFixed(maxFractionDigits).replace(".", ",");
  return sanitizeUnsignedDecimalString(fixed, maxFractionDigits);
}
