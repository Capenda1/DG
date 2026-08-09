"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifyStaffPasswordResetCode } from "@/lib/api-client";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import {
  dadivaBtnPrimaryAuth,
  dadivaInputAuth,
  dadivaLabelAuth,
} from "@/lib/dadiva-ui-classes";
import {
  clearPasswordResetEmail,
  peekPasswordResetEmail,
  savePasswordResetToken,
} from "@/lib/password-reset-session";
import { ROUTES } from "@/lib/routes";
import { runFormErrorShake } from "@/lib/anime-ui";

export default function VerificarCodigoPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!peekPasswordResetEmail()) {
      router.replace(ROUTES.loginRecuperar);
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

    const email = peekPasswordResetEmail();
    const trimmedCode = code.replace(/\D/g, "");
    if (!email) {
      router.replace(ROUTES.loginRecuperar);
      return;
    }
    if (trimmedCode.length !== 6) {
      setError("Introduza o código de 6 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const res = await verifyStaffPasswordResetCode(email, trimmedCode);
      savePasswordResetToken(res.resetToken);
      clearPasswordResetEmail();
      router.push(ROUTES.loginRedefinir);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Código inválido ou expirado.";
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
      title="Verificar código"
      subtitle="Introduza o código recebido por email."
      footer={
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={ROUTES.loginRecuperar} className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-300">
            Pedir novo código
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" aria-busy={loading}>
        <div>
          <label htmlFor="verify-code" className={dadivaLabelAuth}>Código</label>
          <input
            id="verify-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            disabled={loading}
            placeholder="000000"
            className={`${dadivaInputAuth} text-center text-lg font-bold tracking-[0.35em]`}
          />
        </div>

        {error && (
          <div ref={errorRef} className="rounded-xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-400/60 dark:bg-red-950 dark:text-red-200" role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className={dadivaBtnPrimaryAuth}>
          {loading ? "A verificar…" : "Verificar"}
        </button>
      </form>
    </AuthScreenLayout>
  );
}
