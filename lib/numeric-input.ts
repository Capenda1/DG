/**
 * Entrada controlada para valores numéricos em inputs (texto).
 * Impede letras e símbolos inválidos antes do submit.
 */

/** Quantidades / stock no Prisma: Decimal(12, 3). */
export const STOCK_DECIMAL_PLACES = 3;

/** Preços / dinheiro no Prisma: Decimal(12, 2). */
export const MONEY_DECIMAL_PLACES = 2;

/**
 * Apenas dígitos (≥ 0). Remove letras e outros caracteres.
 */
export function sanitizeUnsignedIntString(raw: string): string {
  return raw.replace(/\D+/g, "");
}

/**
 * Decimal não negativo: só dígitos e um separador (`,` ou `.`).
 * Limita casas decimais. Não aceita sinal nem letras.
 */
export function sanitizeUnsignedDecimalString(
  raw: string,
  maxFractionDigits: number,
): string {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  let sepAt = -1;
  let sep: "," | "." = ",";
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i]!;
    if (c === "," || c === ".") {
      sepAt = i;
      sep = c;
      break;
    }
  }
  if (sepAt < 0) return cleaned.replace(/\D/g, "");

  const intDigits = cleaned.slice(0, sepAt).replace(/\D/g, "");
  const fracRaw = cleaned.slice(sepAt + 1);
  const fracDigits = fracRaw.replace(/\D/g, "").slice(0, maxFractionDigits);

  if (!intDigits && !fracDigits) return "";

  const head = intDigits || "0";
  const hadTrailingSep =
    fracDigits.length === 0 &&
    /[.,]$/.test(cleaned) &&
    fracRaw.replace(/\D/g, "") === "";

  if (fracDigits.length > 0 || hadTrailingSep) {
    return hadTrailingSep ? `${head}${sep}` : `${head}${sep}${fracDigits}`;
  }
  return head;
}

/**
 * Inteiro com sinal opcional (ex.: rotação -180…180). Só permite um `-` no início e dígitos.
 */
export function sanitizeSignedIntString(raw: string): string {
  const cleaned = raw.replace(/[^\d-]/g, "");
  if (cleaned === "") return "";

  let sign = "";
  let rest = cleaned;
  if (rest[0] === "-") {
    sign = "-";
    rest = rest.slice(1).replace(/-/g, "");
  } else {
    rest = rest.replace(/-/g, "");
  }
  const digits = rest.replace(/\D/g, "");
  if (sign && digits === "") return "-";
  if (!sign && digits === "") return "";
  return `${sign}${digits}`;
}
