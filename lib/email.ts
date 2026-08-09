/** Normaliza email para comparação e envio à API. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Verifica se o email já existe na lista carregada (pré-validação UI). */
export function emailExistsInList(
  email: string,
  users: { id: string; email: string }[],
  excludeUserId?: string,
): boolean {
  const norm = normalizeEmail(email);
  if (!norm) return false;
  return users.some(
    (u) => u.id !== excludeUserId && normalizeEmail(u.email) === norm,
  );
}
