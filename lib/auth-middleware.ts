import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_ACCESS_COOKIE } from "./auth-cookies";
import {
  adminHomePathForRole,
  canAccessPedidoModelagemRoute,
  isStaffRole,
  normalizeAppPathname,
  normalizeUserRole,
  pathnameAllowedForAttendantRole,
  pathnameAllowedForDesignerRole,
  ROUTES,
} from "./routes";

export type AccessClaims = {
  sub: string;
  email: string;
  role: string;
};

function isStaffModelagemRoute(pathname: string): boolean {
  return /^\/conta\/pedidos\/[^/]+\/modelagem\/?$/.test(
    normalizeAppPathname(pathname),
  );
}

export function isPublicAuthPath(pathname: string): boolean {
  const p = normalizeAppPathname(pathname);
  return (
    p === ROUTES.clientLogin ||
    p === ROUTES.clientRegister ||
    p === ROUTES.login ||
    p.startsWith("/login/") ||
    p === ROUTES.admin.login
  );
}

export function readAccessToken(request: NextRequest): string | null {
  const raw = request.cookies.get(AUTH_ACCESS_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessClaims | null> {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    const role = typeof payload.role === "string" ? payload.role : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub || !role) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

export function resolveProtectedRedirect(
  pathname: string,
  claims: AccessClaims,
): string | null {
  const role = normalizeUserRole(claims.role);
  const p = normalizeAppPathname(pathname);

  if (p === ROUTES.admin.root || p.startsWith(`${ROUTES.admin.root}/`)) {
    if (!isStaffRole(role)) {
      return ROUTES.account;
    }
    if (role === "DESIGNER" && !pathnameAllowedForDesignerRole(p)) {
      return adminHomePathForRole(role);
    }
    if (role === "ATTENDANT" && !pathnameAllowedForAttendantRole(p)) {
      return adminHomePathForRole(role);
    }
    return null;
  }

  if (p === ROUTES.account || p.startsWith(`${ROUTES.account}/`)) {
    if (role === "CLIENT") {
      return null;
    }
    if (
      isStaffRole(role) &&
      isStaffModelagemRoute(p) &&
      canAccessPedidoModelagemRoute(role)
    ) {
      return null;
    }
    if (isStaffRole(role)) {
      return adminHomePathForRole(role);
    }
    return ROUTES.clientLogin;
  }

  return null;
}
