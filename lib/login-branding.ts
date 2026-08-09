import { businessLogoDisplayUrl } from "./api-client";

/** Imagem local quando não há upload ou a API falha. */
export const DEFAULT_LOGIN_BG = "/img/login-bg.png";

/** Resolve URL do fundo (só paths internos da API ou default). */
export function loginBackgroundDisplayUrl(
  backgroundUrl: string | null | undefined,
  updatedAt?: string | null,
): string {
  if (!backgroundUrl?.trim()) return DEFAULT_LOGIN_BG;
  const resolved = businessLogoDisplayUrl(backgroundUrl);
  if (!resolved) return DEFAULT_LOGIN_BG;
  if (updatedAt?.trim() && resolved.includes("/api/")) {
    const sep = resolved.includes("?") ? "&" : "?";
    return `${resolved}${sep}v=${encodeURIComponent(updatedAt.trim())}`;
  }
  return resolved;
}
