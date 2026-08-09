"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loginRequest, verifyMfaLoginRequest } from "@/lib/api-client";
import { consumeLoginFlashMessage, saveSession } from "@/lib/auth-session";
import {
  dadivaBtnPrimaryAuth,
  dadivaInputAuth,
  dadivaLabelAuth,
} from "@/lib/dadiva-ui-classes";
import { sanitizeLoginNextPath } from "@/lib/login-next-path";
import { postLoginPath, ROUTES } from "@/lib/routes";
import { normalizeEmail } from "@/lib/email";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LoginBackground } from "@/components/auth/LoginBackground";
import {
  runFormErrorShake,
  runLoginLoadingScreen,
  runLoginReveal,
  runSubmitButtonSpinner,
} from "@/lib/anime-ui";

function IconSpark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2zM19 13l.6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6.6-2.4zM5 15l.8 3.2 3.2.8-3.2.8-.8 3.2-.8-3.2-3.2-.8 3.2-.8.8-3.2z" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 7h16v10H4z" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const revealRootRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const loadingOverlayRef = useRef<HTMLDivElement>(null);
  const loadingPanelRef = useRef<HTMLDivElement>(null);
  const loadingDotsRef = useRef<HTMLDivElement>(null);
  const submitSpinnerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = revealRootRef.current;
    if (!root) return undefined;
    return runLoginReveal(root);
  }, []);

  useEffect(() => {
    const flash = consumeLoginFlashMessage();
    if (flash) setError(flash);
  }, []);

  useEffect(() => {
    if (!error) return undefined;
    const el = errorRef.current;
    if (!el) return undefined;
    return runFormErrorShake(el);
  }, [error]);

  useEffect(() => {
    if (!loading) return undefined;
    const overlay = loadingOverlayRef.current;
    const panel = loadingPanelRef.current;
    const dotsRoot = loadingDotsRef.current;
    if (!overlay || !panel || !dotsRoot) return undefined;
    const dots = Array.from(
      dotsRoot.querySelectorAll<HTMLElement>(".login-loading-dot"),
    );
    return runLoginLoadingScreen(overlay, panel, dots);
  }, [loading]);

  useEffect(() => {
    if (!loading) return undefined;
    const el = submitSpinnerRef.current;
    if (!el) return undefined;
    return runSubmitButtonSpinner(el);
  }, [loading]);

  async function finishLogin(session: { user: { role: string } }) {
    const roleDefault = postLoginPath(session.user.role);
    if (roleDefault === ROUTES.login) {
      setError(
        "Este perfil não é reconhecido. O papel da conta deve ser CLIENT, ADMIN, DESIGNER ou ATTENDANT.",
      );
      return;
    }
    saveSession(session as Parameters<typeof saveSession>[0]);
    const nextParam = sanitizeLoginNextPath(searchParams.get("next"));
    const dest = nextParam ?? roleDefault;
    window.location.assign(dest);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mfaToken) {
        const session = await verifyMfaLoginRequest(mfaToken, mfaCode);
        await finishLogin(session);
        return;
      }
      const result = await loginRequest(normalizeEmail(email), password);
      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode("");
        return;
      }
      if (!("user" in result) || !result.user) {
        setError("Resposta de login inválida. Tente novamente.");
        return;
      }
      await finishLogin(result);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Erro ao iniciar sessão.";
      if (
        err instanceof TypeError ||
        /^failed\s+fetch$/i.test(message.trim()) ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        message =
          "Não há ligação ao servidor. Confirme que a API Nest está activa e que `INTERNAL_API_URL` (ou `NEXT_PUBLIC_API_URL`) aponta para ela.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root relative flex min-h-svh flex-col bg-zinc-100 text-zinc-900 dark:bg-black dark:text-white">
      {loading ? (
        <div
          ref={loadingOverlayRef}
          className="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-zinc-900/35 px-4 backdrop-blur-[3px] dark:bg-black/55"
        >
          <div className="absolute inset-0" aria-hidden />
          <div
            ref={loadingPanelRef}
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="relative z-[1] flex cursor-default flex-col items-center rounded-2xl border border-white/80 bg-white/95 px-9 py-8 shadow-xl ring-1 ring-zinc-200/80 dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:ring-white/10"
          >
            <div className="mb-4 rounded-full bg-amber-400/15 p-3 ring-2 ring-amber-400/30 dark:bg-amber-400/10 dark:ring-amber-400/20">
              <IconSpark className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              A iniciar sessão…
            </p>
            <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Aguarda pela resposta do servidor.
            </p>
            <div ref={loadingDotsRef} className="mt-5 flex gap-2.5" aria-hidden>
              <span className="login-loading-dot inline-block size-2.5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm shadow-amber-500/40" />
              <span className="login-loading-dot inline-block size-2.5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm shadow-amber-500/40" />
              <span className="login-loading-dot inline-block size-2.5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm shadow-amber-500/40" />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Fundo fotográfico ── */}
      <LoginBackground />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-10 sm:items-end sm:py-12 sm:pl-8 sm:pr-12 md:py-14 md:pr-16 lg:pr-24">
        <div className="w-full max-w-lg shrink-0">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200/90 bg-white/90 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] ring-1 ring-zinc-200/50 backdrop-blur-xl dark:border-white/10 dark:bg-black/80 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] dark:ring-white/5">
            {/* Linha dourada no topo */}
            <div ref={revealRootRef}>
              <div
                data-anime-login
                className="h-[3px] w-full bg-gradient-to-r from-amber-500 via-violet-500 to-sky-500 opacity-95 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.45)]"
              />

            <div className="px-7 py-8 sm:px-10 sm:py-10">
              <header data-anime-login className="mb-7 text-left sm:mb-8">
                {/* Badge da marca */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
                  <IconSpark className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  Dádiva Go
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-[1.7rem] dark:text-white">
                  {mfaToken ? "Verificação em dois passos" : "Iniciar sessão"}
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {mfaToken
                    ? "Introduz o código da app autenticadora (ou um código de recuperação)."
                    : "Utiliza o email e a palavra-passe da conta criada pelo administrador da plataforma."}
                </p>
              </header>

              <form
                data-anime-login
                onSubmit={handleSubmit}
                className="flex flex-col gap-5"
                aria-busy={loading}
                autoComplete="on"
              >
                {mfaToken ? (
                  <div>
                    <label htmlFor="login-mfa" className={dadivaLabelAuth}>
                      Código MFA
                    </label>
                    <input
                      id="login-mfa"
                      name="mfa"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      required
                      minLength={6}
                      disabled={loading}
                      placeholder="000000"
                      className={`${dadivaInputAuth} font-mono tracking-[0.2em]`}
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setMfaToken(null);
                        setMfaCode("");
                        setError(null);
                      }}
                      className="mt-2 text-[11px] font-semibold text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                    >
                      Voltar ao email e palavra-passe
                    </button>
                  </div>
                ) : (
                  <>
                <div>
                  <label htmlFor="login-email" className={dadivaLabelAuth}>Email</label>
                  <div className="relative">
                    <IconMail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      placeholder="nome@empresa.com"
                      className={`${dadivaInputAuth} pl-11 pr-4`}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className={dadivaLabelAuth}>
                      Palavra-passe
                    </label>
                    <Link
                      href={ROUTES.loginRecuperar}
                      className="text-[11px] font-semibold text-amber-700 underline-offset-2 transition hover:underline dark:text-amber-300"
                    >
                      Recuperar acesso (admin)
                    </Link>
                  </div>
                  <div className="relative">
                    <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={loading}
                      className={`${dadivaInputAuth} pl-11 pr-[4.25rem]`}
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-xs font-semibold text-zinc-500 underline-offset-2 transition hover:text-amber-700 hover:underline dark:text-zinc-400 dark:hover:text-amber-300"
                      aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>
                  </>
                )}

                {error && (
                  <div ref={errorRef} className="rounded-xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800 dark:border-red-400/60 dark:bg-red-950 dark:text-red-200" role="alert">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className={dadivaBtnPrimaryAuth}>
                  {loading ? (
                    <>
                      <span
                        ref={submitSpinnerRef}
                        className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-black/15 border-t-black/75 dark:border-white/25 dark:border-t-white"
                        aria-hidden
                      />
                      <span>A entrar…</span>
                    </>
                  ) : mfaToken ? (
                    "Confirmar código"
                  ) : (
                    "Entrar"
                  )}
                </button>
              </form>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
