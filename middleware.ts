import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth-cookies";
import {
  isPublicAuthPath,
  readAccessToken,
  resolveProtectedRedirect,
  verifyAccessToken,
} from "@/lib/auth-middleware";
import { normalizeUserRole, postLoginPath, ROUTES } from "@/lib/routes";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAuthPath(pathname)) {
    const token = readAccessToken(request);
    if (!token) {
      return NextResponse.next();
    }
    const claims = await verifyAccessToken(token);
    if (!claims) {
      const res = NextResponse.next();
      res.cookies.delete(AUTH_ACCESS_COOKIE);
      return res;
    }
    const dest = postLoginPath(normalizeUserRole(claims.role));
    if (dest !== ROUTES.login) {
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  const token = readAccessToken(request);
  if (!token) {
    return redirectLogin(request, pathname);
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    return redirectLogin(request, pathname);
  }

  const redirectPath = resolveProtectedRedirect(pathname, claims);
  if (redirectPath) {
    if (redirectPath === ROUTES.login) {
      return redirectLogin(request, pathname);
    }
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

function redirectLogin(request: NextRequest, pathname: string) {
  const url = new URL(ROUTES.login, request.url);
  const nextPath = normalizeAppPathnameSafe(pathname);
  if (nextPath && nextPath !== ROUTES.home && !isPublicAuthPath(nextPath)) {
    url.searchParams.set("next", nextPath);
  }
  const res = NextResponse.redirect(url);
  res.cookies.delete(AUTH_ACCESS_COOKIE);
  return res;
}

function normalizeAppPathnameSafe(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/conta/:path*",
    "/login",
    "/login/:path*",
  ],
};
