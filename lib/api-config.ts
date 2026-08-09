const DEFAULT_API = "http://localhost:4000";

/**
 * Normaliza NEXT_PUBLIC_API_URL: remove barra final e sufixo `/api` órfão
 * (evita montar URLs como `/api/api/auth/login`).
 */
export function sanitizeApiOrigin(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (s.toLowerCase().endsWith("/api")) {
    s = s.slice(0, -4).replace(/\/+$/, "");
  }
  return s;
}

/**
 * Origem única para o servidor Next reencaminhar `/api/*` em desenvolvimento
 * (`next.config.ts` rewrites).
 */
export function devApiRewriteOrigin(): string {
  const preferred =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  let base = sanitizeApiOrigin(preferred || DEFAULT_API);
  if (!base) base = sanitizeApiOrigin(DEFAULT_API);
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  return base;
}

/** Em `next dev`, com proxy BFF activo, pedidos relativos `/api/*` funcionam no mesmo host. */
function sameOriginDevApiEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DEV_API_PROXY !== "0"
  );
}

/** @deprecated Preferir same-origin via route handlers BFF; mantido para compatibilidade interna. */
export { sameOriginDevApiEnabled };

/**
 * No browser, pedidos autenticados vão sempre same-origin (`/api/*` → BFF Next)
 * para que cookies HttpOnly de sessão sejam enviados automaticamente.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const configured = sanitizeApiOrigin(
    process.env.INTERNAL_API_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      DEFAULT_API,
  );
  return configured;
}
