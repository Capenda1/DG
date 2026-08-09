const AO_CC = '244';
const NATIONAL_LEN = 9;

/** Remove tudo excepto dígitos. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Normaliza telefone angolano para E.164 (+244 + 9 dígitos nacionais).
 * Aceita entradas com ou sem indicativo 244.
 */
export function normalizeAngolaPhoneToE164(
  phone: string | null | undefined,
): string | null {
  if (!phone?.trim()) return null;
  const d = phoneDigitsOnly(phone);
  if (!d) return null;

  let national: string;
  if (d.startsWith(AO_CC)) {
    national = d.slice(AO_CC.length, AO_CC.length + NATIONAL_LEN);
  } else {
    national = d.slice(0, NATIONAL_LEN);
  }

  if (national.length !== NATIONAL_LEN) return null;
  if (!/^[29]/.test(national)) return null;

  return `+${AO_CC}${national}`;
}

/** Formato legível para SMS/UI: +244 923 456 789 */
export function formatAngolaPhoneForDisplay(
  phone: string | null | undefined,
): string | null {
  const e164 = normalizeAngolaPhoneToE164(phone);
  if (!e164) {
    const d = phoneDigitsOnly(phone ?? '');
    if (d.length === NATIONAL_LEN) {
      return `+244 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    }
    const trimmed = phone?.trim();
    return trimmed || null;
  }
  const national = e164.slice(4);
  return `+244 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

export function isAngolaPhoneComplete(phone: string | null | undefined): boolean {
  return normalizeAngolaPhoneToE164(phone) !== null;
}
