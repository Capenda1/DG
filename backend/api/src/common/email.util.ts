/** Normaliza email para comparação e persistência (minúsculas, sem espaços). */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function isValidEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Este Email já está registado.';
