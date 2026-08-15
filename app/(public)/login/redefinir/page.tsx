"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmStaffPasswordReset } from "@/lib/api-client";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import {
  dadivaBtnPrimaryAuth,
  dadivaInputAuth,
  dadivaLabelAuth,
} from "@/lib/dadiva-ui-classes";
import {
  clearPasswordResetSession,
  peekPasswordResetToken,
} from "@/lib/password-reset-session";
import { hardNavigateReplace, ROUTES } from "@/lib/routes";
import { runFormErrorShake } from "@/lib/anime-ui";

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
    </svg>
  );
}

export default function RedefinirPalavraPassePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!peekPasswordResetToken()) {
      router.replace(ROUTES.loginVerificar);
    }
  }, [router]);

  useEffect(() => {
    if (!error) return undefined;
    const el = errorRef.current;
    if (!el) return undefined;
    return runFormErrorShake(el);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const resetToken = peekPasswordResetToken();
    if (!resetToken) {
      router.replace(ROUTES.loginVerificar);
      return;
    }
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await confirmStaffPasswordReset(resetToken, password);
      clearPasswordResetSession();
      setSuccess(true);
      window.setTimeout(() => hardNavigateReplace(ROUTES.admin.login), 1800);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Não foi possível guardar a palavra-passe.";
      if (
        err instanceof TypeError ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        message = "Não há ligação ao servidor.";
      }
      if (message.includes("Sessão de recuperação")) {
        clearPasswordResetSession();
        router.replace(ROUTES.loginRecuperar);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Nova palavra-passe"
      subtitle="Escolha uma palavra-passe com pelo menos 8 caracteres."
      footer={
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={ROUTES.admin.login} className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-300">
            Início de sessão
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={loading}>
        <div>
          <label htmlFor="reset-password" className={dadivaLabelAuth}>Palavra-passe</label>
          <div className="relative">
            <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || success}
              className={`${dadivaInputAuth} pl-11 pr-[4.25rem]`}
            />
            <button
              type="button"
              disabled={loading || success}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-xs font-semibold text-zinc-500 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="reset-password-confirm" className={dadivaLabelAuth}>Confirmar</label>
          <div className="relative">
            <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              id="reset-password-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || success}
              className={`${dadivaInputAuth} pl-11 pr-4`}
            />
          </div>
        </div>

        {error && (
          <div ref={errorRef} className="rounded-xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-400/60 dark:bg-red-950 dark:text-red-200" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border-2 border-emerald-300/80 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-950/80 dark:text-emerald-100" role="status">
            Palavra-passe atualizada.
          </div>
        )}

        {!success ? (
          <button type="submit" disabled={loading} className={dadivaBtnPrimaryAuth}>
            {loading ? "A guardar…" : "Guardar"}
          </button>
        ) : null}
      </form>
    </AuthScreenLayout>
  );
}
