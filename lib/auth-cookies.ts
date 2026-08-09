/** Nomes dos cookies HttpOnly (partilhados entre middleware e route handlers). */
export const AUTH_ACCESS_COOKIE = "dadivago_access";
export const AUTH_REFRESH_COOKIE = "dadivago_refresh";

const DEFAULT_ACCESS_MAX_AGE = 15 * 60;
const DEFAULT_REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export function maxAgeSecondsFromJwt(accessToken: string): number {
  try {
    const segment = accessToken.split(".")[1];
    if (!segment) return DEFAULT_ACCESS_MAX_AGE;
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp === "number") {
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      return remaining > 0 ? remaining : 0;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCESS_MAX_AGE;
}

export function refreshCookieMaxAge(): number {
  const raw = process.env.JWT_REFRESH_EXPIRES_DAYS?.trim();
  const days = raw ? parseInt(raw, 10) : 7;
  return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60;
}

export function cookieSecureFlag(): boolean {
  return process.env.NODE_ENV === "production";
}

export { DEFAULT_REFRESH_MAX_AGE };
