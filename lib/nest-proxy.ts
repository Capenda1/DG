import { devApiRewriteOrigin } from "./api-config";
import {
  readAccessTokenFromCookieHeader,
} from "./session-cookies.server";

const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "transfer-encoding",
]);

export function nestApiOrigin(): string {
  return devApiRewriteOrigin();
}

function buildNestUrl(pathSegments: string[], search: string): string {
  const path = pathSegments.map(encodeURIComponent).join("/");
  const base = nestApiOrigin().replace(/\/+$/, "");
  return `${base}/api/${path}${search}`;
}

/**
 * Reencaminha pedidos `/api/*` do browser para a API Nest, injectando Bearer
 * a partir do cookie HttpOnly quando presente.
 */
export async function proxyToNest(
  request: Request,
  pathSegments: string[],
): Promise<Response> {
  const incoming = new URL(request.url);
  const targetUrl = buildNestUrl(pathSegments, incoming.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const accessToken = readAccessTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: hasBody ? request.body : undefined,
    // @ts-expect-error — streaming body (Node 18+ / undici)
    duplex: hasBody ? "half" : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding" || lower === "connection") return;
    responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function postToNest<T>(
  path: string,
  body: unknown,
  init?: { authorization?: string },
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${nestApiOrigin().replace(/\/+$/, "")}/api/${path.replace(/^\//, "")}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (init?.authorization) {
    headers.Authorization = init.authorization;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}
