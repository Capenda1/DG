"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { requestStaffPasswordReset } from "@/lib/api-client";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import {
  dadivaBtnPrimaryAuth,
  dadivaInputAuth,
  dadivaLabelAuth,
} from "@/lib/dadiva-ui-classes";
import { savePasswordResetEmail } from "@/lib/password-reset-session";
import { ROUTES } from "@/lib/routes";
import { runFormErrorShake } from "@/lib/anime-ui";

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 7h16v10H4z" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RecuperarPalavraPassePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return undefined;
    const el = errorRef.current;
    if (!el) return undefined;
    return runFormErrorShake(el);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    try {
      await requestStaffPasswordReset(trimmedEmail);
      savePasswordResetEmail(trimmedEmail);
      router.push(ROUTES.loginVerificar);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Não foi possível processar o pedido.";
      if (
        err instanceof TypeError ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        message = "Não há ligação ao servidor.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Recuperar acesso"
      subtitle="Indique o email da conta de administrador."
      footer={
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={ROUTES.admin.login} className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-300">
            Voltar ao início de sessão
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={loading}>
        <div>
          <label htmlFor="recover-email" className={dadivaLabelAuth}>Email</label>
          <div className="relative">
            <IconMail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              id="recover-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className={`${dadivaInputAuth} pl-11 pr-4`}
            />
          </div>
        </div>

        {error && (
          <div ref={errorRef} className="rounded-xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-400/60 dark:bg-red-950 dark:text-red-200" role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className={dadivaBtnPrimaryAuth}>
          {loading ? "A enviar…" : "Continuar"}
        </button>
      </form>
    </AuthScreenLayout>
  );
}
