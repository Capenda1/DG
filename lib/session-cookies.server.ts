import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  cookieSecureFlag,
  maxAgeSecondsFromJwt,
  refreshCookieMaxAge,
} from "./auth-cookies";

export function readAccessTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${AUTH_ACCESS_COOKIE}=`)) {
      const raw = trimmed.slice(AUTH_ACCESS_COOKIE.length + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function readRefreshTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${AUTH_REFRESH_COOKIE}=`)) {
      const raw = trimmed.slice(AUTH_REFRESH_COOKIE.length + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function attachAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = cookieSecureFlag();
  const accessMaxAge = maxAgeSecondsFromJwt(accessToken);
  if (accessMaxAge > 0) {
    response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: accessMaxAge,
    });
  }
  response.cookies.set(AUTH_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: refreshCookieMaxAge(),
  });
}

export function clearAuthCookies(response: NextResponse): void {
  const secure = cookieSecureFlag();
  response.cookies.set(AUTH_ACCESS_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
