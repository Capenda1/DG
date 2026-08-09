"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, logoutRequest } from "@/lib/api-client";
import {
  clearSession,
  SESSION_INVALIDATED_EVENT,
  loadSession,
  type AuthSession,
  saveSession,
  setLoginFlashMessage,
} from "@/lib/auth-session";
import {
  adminHomePathForRole,
  hardNavigateReplace,
  isStaffRole,
  normalizeAppPathname,
  normalizeUserRole,
  pathnameAllowedForAttendantRole,
  pathnameAllowedForDesignerRole,
  ROUTES,
} from "@/lib/routes";
import { DesignerOrderChatFab } from "@/components/chat/DesignerOrderChatFab";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { dadivaScreenWaiting } from "@/lib/dadiva-ui-classes";
import { AdminSidebar } from "./AdminSidebar";

const SIDEBAR_COLLAPSED_KEY = "dadiva-admin-sidebar-collapsed";
const MFA_SETTINGS_HREF = `${ROUTES.admin.configuracoes}#sistema`;

function isAuthFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    ((err as { status?: number }).status === 401 ||
      (err as { status?: number }).status === 403)
  );
}

export function AdminAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const roleRedirectRef = useRef<string | null>(null);

  const syncSession = useCallback(() => {
    setSession(loadSession());
  }, []);
  useEffect(() => {
    syncSession();
  }, [syncSession]);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  const setSidebarCollapsedPersist = useCallback((next: boolean) => {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
  }, []);

  const goLoginClearingCookies = useCallback(async (flash: string) => {
    setLoginFlashMessage(flash);
    clearSession();
    setSession(null);
    try {
      // Limpar cookies HttpOnly sem emitir SESSION_INVALIDATED (evita reentrância).
      await fetch("/api/session/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    hardNavigateReplace(ROUTES.login);
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
        hardNavigateReplace(ROUTES.login);
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
        // Cookies HttpOnly bastam — não redirecionar só porque o sessionStorage está vazio
        // (isso + middleware em /login criava loop GET /admin infinito).
        const user = await fetchMe();
        if (cancelled) return;
        const updated: AuthSession = { user };
        saveSession(updated);
        setSession(updated);
        if (!isStaffRole(user.role)) {
          hardNavigateReplace(ROUTES.account);
        }
      } catch (err) {
        if (cancelled) return;
        const local = loadSession();
        if (local?.user && isStaffRole(local.user.role) && !isAuthFailure(err)) {
          // Rede/API indisponível: manter perfil local em vez de saltar para /login
          // (middleware com cookie válido reenviaria outra vez para /admin).
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
    if (normalizeUserRole(session.user.role) !== "ADMIN") return;
    if (!session.user.mfaSetupRequired) return;
    const p = normalizeAppPathname(pathname);
    const onSettings =
      p === ROUTES.admin.configuracoes ||
      p.startsWith(`${ROUTES.admin.configuracoes}/`);
    if (onSettings) {
      roleRedirectRef.current = null;
      if (
        typeof window !== "undefined" &&
        window.location.hash !== "#sistema"
      ) {
        window.history.replaceState(null, "", "#sistema");
        window.dispatchEvent(new Event("hashchange"));
      }
      return;
    }
    if (roleRedirectRef.current === MFA_SETTINGS_HREF) return;
    roleRedirectRef.current = MFA_SETTINGS_HREF;
    // Full navigation preserva `#sistema` (o router do App Router pode ignorar hash).
    hardNavigateReplace(MFA_SETTINGS_HREF);
  }, [checked, session?.user, pathname]);

  useEffect(() => {
    if (!checked || !session?.user) return;
    if (normalizeUserRole(session.user.role) !== "DESIGNER") return;
    if (pathnameAllowedForDesignerRole(pathname)) {
      roleRedirectRef.current = null;
      return;
    }
    if (roleRedirectRef.current === ROUTES.admin.designer) return;
    roleRedirectRef.current = ROUTES.admin.designer;
    router.replace(ROUTES.admin.designer);
  }, [checked, session?.user, pathname, router]);

  useEffect(() => {
    if (!checked || !session?.user) return;
    if (normalizeUserRole(session.user.role) !== "ATTENDANT") return;
    const p = normalizeAppPathname(pathname);
    if (
      p === ROUTES.admin.financeiro ||
      p.startsWith(`${ROUTES.admin.financeiro}/`)
    ) {
      if (roleRedirectRef.current === ROUTES.admin.caixa) return;
      roleRedirectRef.current = ROUTES.admin.caixa;
      router.replace(ROUTES.admin.caixa);
      return;
    }
    if (pathnameAllowedForAttendantRole(pathname)) {
      roleRedirectRef.current = null;
      return;
    }
    if (roleRedirectRef.current === ROUTES.admin.pedidoBalcao) return;
    roleRedirectRef.current = ROUTES.admin.pedidoBalcao;
    router.replace(ROUTES.admin.pedidoBalcao);
  }, [checked, session?.user, pathname, router]);

  function logout() {
    void logoutRequest().finally(() => {
      setSession(null);
      hardNavigateReplace(ROUTES.login);
    });
  }

  if (!checked) {
    return (
      <div className={`min-h-screen ${dadivaScreenWaiting}`}>
        A validar acesso…
      </div>
    );
  }

  if (!session?.user || !isStaffRole(session.user.role)) {
    return (
      <div className={`min-h-screen ${dadivaScreenWaiting}`}>
        A redirecionar…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-[#0a0a0a] dark:text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-1/4 -top-32 h-[22rem] w-[120%] rounded-full bg-amber-400/14 blur-[3.75rem] dark:bg-amber-500/11" />
        <div className="absolute -right-24 top-0 h-56 w-56 rounded-full bg-violet-500/11 blur-[3.25rem] dark:bg-violet-500/13" />
        <div className="absolute bottom-0 left-1/3 h-48 w-[min(90%,28rem)] -translate-x-1/2 rounded-full bg-sky-400/10 blur-[3rem] opacity-70 dark:bg-sky-500/09" />
      </div>

      <div className="relative z-10 flex min-h-screen min-w-0 flex-1">

      {/* ── Sidebar ── */}
      <AdminSidebar
        user={session.user}
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsedPersist}
      />

      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm dark:bg-black/70 lg:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Conteúdo principal ── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        {/* Barra de topo mobile */}
        <header
          className="relative flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-zinc-950/90 lg:hidden"
        >
          <div className="absolute left-0 top-0 z-[1] h-[3px] w-full bg-gradient-to-r from-amber-500 via-violet-500 to-sky-500 opacity-95" aria-hidden />
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-zinc-600 transition hover:bg-amber-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Abrir menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href={adminHomePathForRole(session.user.role)}
            className="flex items-baseline gap-0.5 text-sm font-bold text-zinc-900 dark:text-white"
          >
            <span className="text-zinc-900 dark:text-white">Dádiva</span>
            <span className="text-amber-500">Go</span>
          </Link>

          <ThemeToggle size="sm" className="ml-1 shrink-0" />

          <span
            className="ml-auto max-w-[8rem] truncate text-xs text-zinc-500 dark:text-zinc-500"
          >
            {session.user.name}
          </span>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#F3F4F6]/90 text-gray-900 backdrop-blur-[1px] dark:bg-zinc-900/92 dark:text-zinc-100">
          {children}
        </main>
      </div>
      </div>

      {normalizeUserRole(session.user.role) === "DESIGNER" && (
        <DesignerOrderChatFab />
      )}
    </div>
  );
}
