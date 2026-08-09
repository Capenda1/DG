import { NextResponse } from "next/server";
import { postToNest } from "@/lib/nest-proxy";
import {
  clearAuthCookies,
  readRefreshTokenFromCookieHeader,
} from "@/lib/session-cookies.server";

export async function POST(request: Request) {
  const refreshToken = readRefreshTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  if (refreshToken) {
    try {
      await postToNest("auth/logout", { refreshToken });
    } catch {
      /* revogação best-effort */
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
