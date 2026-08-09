/**
 * WhatsApp / telefone — Angola (+244, números móveis nacionais com 9 dígitos).
 * Exibição: +244 9XX XXX XXX
 * Para API/BD: dígitos com indicativo 244 via `angolaPhoneForStorage`.
 */

const AO_CC = "244";
const NATIONAL_LEN = 9;

export function phoneDigitsOnly(masked: string): string {
  return masked.replace(/\D/g, "");
}

/**
 * Máscara progressiva enquanto o utilizador digita ou cola o número.
 * Aceita dígitos nacionais (até 9) ou já com prefixo 244.
 */
export function formatWhatsAppMaskInput(raw: string): string {
  const d = phoneDigitsOnly(raw);
  let national: string;

  if (d.startsWith(AO_CC)) {
    if (d.length <= AO_CC.length) return "+244";
    national = d.slice(AO_CC.length, AO_CC.length + NATIONAL_LEN);
  } else {
    national = d.slice(0, NATIONAL_LEN);
  }

  if (national.length === 0) return "";

  const a = national.slice(0, 3);
  const b = national.slice(3, 6);
  const c = national.slice(6, 9);
  let s = "+244 " + a;
  if (b.length > 0) s += " " + b;
  if (c.length > 0) s += " " + c;
  return s;
}

/** Normaliza telefone vindo da API para o mesmo formato visual. */
export function displayPhoneAsMask(phone: string | null | undefined): string {
  if (!phone?.trim()) return "";
  let d = phoneDigitsOnly(phone);
  if (d.startsWith(AO_CC) && d.length > AO_CC.length) d = d.slice(AO_CC.length);
  d = d.slice(0, NATIONAL_LEN);
  return d ? formatWhatsAppMaskInput(d) : "";
}

/**
 * Valor a guardar/enviar: preferência por 12 dígitos (244 + 9 nacionais)
 * quando há 9 dígitos nacionais completos.
 */
export function angolaPhoneForStorage(masked: string): string {
  const d = phoneDigitsOnly(masked);
  if (d.startsWith(AO_CC)) return d.slice(0, AO_CC.length + NATIONAL_LEN);
  if (d.length >= NATIONAL_LEN) return AO_CC + d.slice(0, NATIONAL_LEN);
  return d;
}

/** True quando existem 9 dígitos nacionais (com ou sem prefixo 244). */
export function isAngolaPhoneComplete(masked: string): boolean {
  const d = phoneDigitsOnly(masked);
  if (d.length === 0) return false;
  if (d.startsWith(AO_CC)) return d.length >= AO_CC.length + NATIONAL_LEN;
  return d.length >= NATIONAL_LEN;
}

/**
 * Valor só com dígitos para a API (`244` + 9 nacionais). Só chamar quando
 * `isAngolaPhoneComplete` for true, ou após entrada vazia (não chamar).
 */
export function angolaPhoneApiDigits(masked: string): string {
  return phoneDigitsOnly(angolaPhoneForStorage(masked)).slice(
    0,
    AO_CC.length + NATIONAL_LEN,
  );
}

/**
 * Comparação estável entre valor guardado (API) e campo com máscara.
 */
export function angolaPhoneNormalizedStored(stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  const d = phoneDigitsOnly(stored);
  if (d.startsWith(AO_CC) && d.length >= AO_CC.length + NATIONAL_LEN) {
    return d.slice(0, AO_CC.length + NATIONAL_LEN);
  }
  if (!d.startsWith(AO_CC) && d.length >= NATIONAL_LEN) {
    return AO_CC + d.slice(0, NATIONAL_LEN);
  }
  return d;
}
