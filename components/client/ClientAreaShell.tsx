"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchMe, logoutRequest } from "@/lib/api-client";
import {
  clearSession,
  loadSession,
  saveSession,
  SESSION_INVALIDATED_EVENT,
  setLoginFlashMessage,
  type AuthSession,
} from "@/lib/auth-session";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  canAccessPedidoModelagemRoute,
  hardNavigateReplace,
  isStaffRole,
  normalizeUserRole,
  ROUTES,
} from "@/lib/routes";
import { FloatingChatWidget } from "@/components/chat/FloatingChatWidget";

/** Mesma rota do editor usado pelo fluxo admin/designer (`contaPedidoModelagemPath`). */
function isStaffModelagemRoute(pathname: string): boolean {
  return /^\/conta\/pedidos\/[^/]+\/modelagem\/?$/.test(pathname);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isAuthFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    ((err as { status?: number }).status === 401 ||
      (err as { status?: number }).status === 403)
  );
}

function redirectIfStaffBlockedFromClientArea(
  pathname: string,
  role: string,
  navigate: (href: string) => void,
  already?: string | null,
): string | null {
  const staffMayUseClienteModelagem =
    isStaffModelagemRoute(pathname) &&
    canAccessPedidoModelagemRoute(role);
  if (isStaffRole(role) && !staffMayUseClienteModelagem) {
    if (already === ROUTES.admin.root) return already;
    navigate(ROUTES.admin.root);
    return ROUTES.admin.root;
  }
  return null;
}

export function ClientAreaShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const roleRedirectRef = useRef<string | null>(null);

  const logout = useCallback(() => {
    void logoutRequest().finally(() => {
      hardNavigateReplace(ROUTES.clientLogin);
    });
  }, []);

  const goLoginClearingCookies = useCallback(async (flash: string) => {
    setLoginFlashMessage(flash);
    clearSession();
    setSession(null);
    try {
      await fetch("/api/session/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    hardNavigateReplace(ROUTES.clientLogin);
  }, []);

  useEffect(() => {
    function onSessionInvalidated() {
      setSession(null);
      setLoginFlashMessage(
        "A sessão terminou ou deixou de ser válida. Inicie sessão novamente.",
      );
      void fetch("/api/session/logout", {
        method: "POST",
        credentials: "include",
      }).finally(() => {
        hardNavigateReplace(ROUTES.clientLogin);
      });
    }
    window.addEventListener(SESSION_INVALIDATED_EVENT, onSessionInvalidated);
    return () =>
      window.removeEventListener(
        SESSION_INVALIDATED_EVENT,
        onSessionInvalidated,
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        const updated: AuthSession = { user };
        saveSession(updated);
        setSession(updated);
      } catch (err) {
        if (cancelled) return;
        const local = loadSession();
        if (local?.user && !isAuthFailure(err)) {
          setSession(local);
          return;
        }
        await goLoginClearingCookies(
          "Não foi possível validar a sessão (ligações ao servidor ou token). Tente iniciar sessão novamente.",
        );
      } finally {
        if (!cancelled) setChecked(true);
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [goLoginClearingCookies]);

  useEffect(() => {
    if (!checked || !session?.user) return;
    roleRedirectRef.current = redirectIfStaffBlockedFromClientArea(
      pathname,
      session.user.role,
      (href) => router.replace(href),
      roleRedirectRef.current,
    );
  }, [checked, session?.user, pathname, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fechar menu ao navegar
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (!checked || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-black text-sm text-zinc-600">
        A carregar…
      </div>
    );
  }

  function navLink(href: string, label: string) {
    const active =
      href === ROUTES.account
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300/80 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30"
            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  }

  const staffModelagem =
    canAccessPedidoModelagemRoute(session.user.role) &&
    isStaffModelagemRoute(pathname);

  const attendantOnModelagem =
    staffModelagem && normalizeUserRole(session.user.role) === "ATTENDANT";

  const modelagemShellHomeHref = attendantOnModelagem
    ? ROUTES.admin.pedidoBalcao
    : staffModelagem
      ? ROUTES.admin.designer
      : ROUTES.account;

  return (
    <div className="min-h-svh bg-zinc-100 text-zinc-900 dark:bg-[#0a0a0a] dark:text-zinc-100">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-white/[0.06] dark:bg-black/95">
        {/* Linha dourada decorativa no topo */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">

          {/* Logo */}
          <Link
            href={modelagemShellHomeHref}
            className="flex items-center gap-2.5 text-base font-bold tracking-tight text-zinc-900 dark:text-white"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 ring-1 ring-amber-400/40">
              <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2l1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2z" />
              </svg>
            </span>
            <span>
              Dádiva <span className="text-amber-400">Go</span>
            </span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 sm:flex">
            {staffModelagem ? (
              attendantOnModelagem ? (
                <>
                  {navLink(ROUTES.admin.pedidoBalcao, "Balcão / PDV")}
                  {navLink(ROUTES.admin.pedidos, "Pedidos")}
                </>
              ) : (
                <>
                  {navLink(ROUTES.admin.designer, "Ferramentas de designer")}
                  {session.user.role !== "DESIGNER"
                    ? navLink(ROUTES.admin.pedidos, "Pedidos")
                    : null}
                </>
              )
            ) : (
              <>
                {navLink(ROUTES.account, "Início")}
                {navLink(ROUTES.accountPedidos, "Pedidos")}
                {navLink(ROUTES.accountPedidoNovo, "Novo pedido")}
              </>
            )}
          </nav>

          {/* Utilizador + burger */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200/60 text-xs font-bold text-amber-950 ring-1 ring-amber-400/50 dark:bg-amber-400/20 dark:text-amber-300 dark:ring-amber-400/30">
                {initials(session.user.name)}
              </div>
              <span className="max-w-[8rem] truncate text-xs text-zinc-600 dark:text-zinc-400">
                {session.user.name.split(" ")[0]}
              </span>
              <ThemeToggle size="sm" />
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-white/5 dark:hover:text-white"
              >
                Sair
              </button>
            </div>

            {/* Tema + burger (mobile) */}
            <ThemeToggle size="sm" className="sm:hidden" />

            {/* Burger mobile */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white sm:hidden"
              aria-label="Menu"
            >
              {menuOpen ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 2l12 12M14 2L2 14" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Menu mobile dropdown */}
        {menuOpen && (
          <div className="border-t border-zinc-200 bg-white px-4 pb-4 pt-2 dark:border-white/[0.06] dark:bg-black sm:hidden">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/80 dark:bg-white/[0.04] dark:ring-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200/60 text-sm font-bold text-amber-950 ring-1 ring-amber-400/45 dark:bg-amber-400/20 dark:text-amber-300 dark:ring-amber-400/30">
                {initials(session.user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{session.user.name}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-500">{session.user.email}</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              {staffModelagem ? (
                attendantOnModelagem ? (
                  <>
                    {navLink(ROUTES.admin.pedidoBalcao, "Balcão / PDV")}
                    {navLink(ROUTES.admin.pedidos, "Pedidos")}
                  </>
                ) : (
                  <>
                    {navLink(ROUTES.admin.designer, "Ferramentas de designer")}
                    {session.user.role !== "DESIGNER"
                      ? navLink(ROUTES.admin.pedidos, "Pedidos")
                      : null}
                  </>
                )
              ) : (
                <>
                  {navLink(ROUTES.account, "Início")}
                  {navLink(ROUTES.accountPedidos, "Os meus pedidos")}
                  {navLink(ROUTES.accountPedidoNovo, "Novo pedido")}
                </>
              )}
            </nav>
            <button
              type="button"
              onClick={logout}
              className="mt-3 w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700/60 dark:text-zinc-400 dark:hover:border-red-500/30 dark:hover:bg-red-950/20 dark:hover:text-red-300"
            >
              Terminar sessão
            </button>
          </div>
        )}
      </header>

      {/* ── Conteúdo ── */}
      <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-900 dark:text-zinc-100 sm:px-6 sm:py-10">
        {children}
      </main>

      {/* ── Chat flutuante (aparece nas páginas de pedido) ── */}
      <FloatingChatWidget />
    </div>
  );
}
