import type { NextConfig } from "next";
import os from "os";
import { buildSecurityHeaders } from "./lib/security-headers";

/**
 * Detecta automaticamente os IPs de todas as interfaces de rede locais
 * para permitir o acesso ao dev server (HMR / WebSocket) via IP na LAN.
 * Adicione IPs extra em NEXT_DEV_ORIGINS (separados por vírgula) se necessário.
 */
function getLanOrigins(): string[] {
  const extra = (process.env.NEXT_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const auto: string[] = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const addr of iface ?? []) {
        if (addr.family === "IPv4" && !addr.internal) {
          auto.push(addr.address);
        }
      }
    }
  } catch {
    // ignora erros de leitura de interfaces
  }

  return [...new Set([...auto, ...extra])];
}

const nextConfig: NextConfig = {
  /** Reduz módulos compilados quando se importa de barris grandes (Recharts, Three…). */
  experimental: {
    optimizePackageImports: [
      "recharts",
      "geist",
      "animejs",
    ],
  },
  /**
   * Pedidos `/api/*` são tratados pelos route handlers Next (BFF + proxy Nest).
   * `INTERNAL_API_URL` aponta para a API Nest no servidor.
   */
  async rewrites() {
    return [];
  },
  // Permite acesso ao dev server (HMR) a partir de qualquer IP local detectado
  allowedDevOrigins: getLanOrigins(),
  devIndicators: false,
  // Necessário para o Dockerfile (copia apenas os artefactos necessários para produção)
  output: "standalone",
  async headers() {
    const security = buildSecurityHeaders();
    return [
      {
        source: "/:path*",
        headers: security,
      },
    ];
  },
};

export default nextConfig;
