/**
 * Destino seguro após login quando o middleware envia ?next=/caminho.
 */
export function sanitizeLoginNextPath(
  next: string | null | undefined,
): string | null {
  if (!next?.trim()) return null;
  const path = next.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.startsWith("/login")) return null;
  if (path === "/admin/login" || path.startsWith("/admin/login/")) return null;
  return path;
}
