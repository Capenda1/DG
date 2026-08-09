import { coerceFiniteNumber } from "@/lib/coerce-values";

/**
 * Formata um valor monetário para exibição.
 * Kwanza angolano (AOA / ISO 4217): formato local pt-AO, sufixo "Kz".
 */
export function formatMoney(amount: unknown, currency?: string | null): string {
  const n = coerceFiniteNumber(amount);

  if (n == null) return "—";

  const curr = (currency ?? "AOA").toUpperCase();

  if (curr === "AOA") {
    const formatted = new Intl.NumberFormat("pt-AO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
    return `${formatted} Kz`;
  }

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: curr,
  }).format(n);
}

/** Células estreitas (térmica): evita quebra entre valor e «Kz» / milhares. */
export function formatMoneyReceiptCell(
  amount: unknown,
  currency?: string | null,
): string {
  return formatMoney(amount, currency).replace(/ /g, "\u00A0");
}
