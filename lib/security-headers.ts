import { sanitizeApiOrigin } from "./api-config";

const isProd = process.env.NODE_ENV === "production";

/** Google Fonts — carregadas dinamicamente na modelagem (`modelagem/page.tsx`). */
const GOOGLE_FONTS_STYLE = "https://fonts.googleapis.com";
const GOOGLE_FONTS_STATIC = "https://fonts.gstatic.com";

/** Origem absoluta da API — legado SSR / imagens absolutas em build. Com BFF, o browser usa same-origin. */
function apiOriginForCsp(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  try {
    const base = sanitizeApiOrigin(raw);
    const withScheme = /^https?:\/\//i.test(base) ? base : `http://${base}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Cabeçalhos HTTP de endurecimento — aplicados a todas as rotas Next.js.
 * CSP tolera inline scripts do next-themes; em dev permite eval/HMR do webpack.
 * Modelagem: canvas blob:/data:, Google Fonts, workers e pré-visualizações em iframe blob:.
 */
export function buildSecurityHeaders(): { key: string; value: string }[] {
  const apiOrigin = apiOriginForCsp();
  const apiExtra = apiOrigin ? ` ${apiOrigin}` : "";

  const connectSrc = [
    "'self'",
    GOOGLE_FONTS_STYLE,
    GOOGLE_FONTS_STATIC,
    // Logos/documentos em URLs HTTPS externas (admin) e pedidos same-origin via BFF
    "https:",
    ...(isProd ? [] : ["ws:", "wss:"]),
    ...(apiExtra ? [apiExtra.trim()] : []),
  ];

  const csp: string[] = [
    "default-src 'self'",
    isProd
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLE}`,
    `img-src 'self' data: blob: https:${apiExtra}`,
    `font-src 'self' data: ${GOOGLE_FONTS_STATIC}`,
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    // data: — tons curtos (ex. feedback UI); blob: — pré-visualizações
    "media-src 'self' blob: data:",
    "frame-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  if (isProd) {
    csp.push("upgrade-insecure-requests");
  }

  const headers: { key: string; value: string }[] = [
    { key: "Content-Security-Policy", value: csp.join("; ") },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}
