import { NextResponse } from "next/server";
import { postToNest } from "@/lib/nest-proxy";
import {
  attachAuthCookies,
  clearAuthCookies,
  readRefreshTokenFromCookieHeader,
} from "@/lib/session-cookies.server";

type NestRefreshResponse = {
  accessToken: string;
  refreshToken?: string;
};

export async function POST(request: Request) {
  const refreshToken = readRefreshTokenFromCookieHeader(
    request.headers.get("cookie"),
  );
  if (!refreshToken) {
    const response = NextResponse.json(
      { message: "Sessão expirada." },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }

  const result = await postToNest<NestRefreshResponse>("auth/refresh", {
    refreshToken,
  });
  if (!result.ok) {
    const response = NextResponse.json(result.data, { status: result.status });
    clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  attachAuthCookies(
    response,
    result.data.accessToken,
    result.data.refreshToken ?? refreshToken,
  );
  return response;
}
