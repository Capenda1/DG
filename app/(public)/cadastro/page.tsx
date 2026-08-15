"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LoginBackground } from "@/components/auth/LoginBackground";
import { registerClientRequest } from "@/lib/api-client";
import { saveSession } from "@/lib/auth-session";
import {
  runFormErrorShake,
  runLoginReveal,
  runSubmitButtonSpinner,
} from "@/lib/anime-ui";
import {
  dadivaBtnPrimaryAuth,
  dadivaInputAuth,
  dadivaLabelAuth,
} from "@/lib/dadiva-ui-classes";
import { ROUTES } from "@/lib/routes";
import {
  angolaPhoneApiDigits,
  formatWhatsAppMaskInput,
  isAngolaPhoneComplete,
} from "@/lib/whatsapp-mask";

function IconSpark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="m12 2 1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2Zm7 11 .6 2.4 2.4.6-2.4.6L19 19l-.6-2.4L16 16l2.4-.6L19 13ZM5 15l.8 3.2L9 19l-3.2.8L5 23l-.8-3.2L1 19l3.2-.8L5 15Z" />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7.2 3.5 4.7 5.1c-.8.5-1.1 1.5-.8 2.4 2 6.2 6.4 10.6 12.6 12.6.9.3 1.9 0 2.4-.8l1.6-2.5-4.2-2-1.3 1.7c-3.3-1.4-6.1-4.2-7.5-7.5l1.7-1.3-2-4.2Z" strokeLinecap="round" strokeLinejoin="round" />
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

export default function ClientRegisterPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isCompany, setIsCompany] = useState(false);
  const [nif, setNif] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const revealRootRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitSpinnerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = revealRootRef.current;
    if (!root) return undefined;
    return runLoginReveal(root);
  }, []);

  useEffect(() => {
    if (!error || !errorRef.current) return undefined;
    return runFormErrorShake(errorRef.current);
  }, [error]);

  useEffect(() => {
    if (!loading || !submitSpinnerRef.current) return undefined;
    return runSubmitButtonSpinner(submitSpinnerRef.current);
  }, [loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Introduz o teu nome completo.");
      return;
    }
    if (!isAngolaPhoneComplete(phone)) {
      setError("Introduz um número de telefone angolano completo.");
      return;
    }
    if (isCompany && !nif.trim()) {
      setError("Introduz o NIF da empresa.");
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
      const session = await registerClientRequest({
        name: trimmedName,
        phone: angolaPhoneApiDigits(phone),
        isCompany,
        ...(isCompany ? { nif: nif.trim() } : {}),
        password,
      });
      saveSession(session);
      window.location.assign(ROUTES.account);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : "Não foi possível criar a conta.";
      if (
        err instanceof TypeError ||
        /^failed\s+fetch$/i.test(message.trim()) ||
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        message = "Não há ligação ao servidor. Tenta novamente dentro de instantes.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-zinc-100 text-zinc-900 dark:bg-black dark:text-white">
      <LoginBackground />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-10 sm:items-end sm:py-12 sm:pl-8 sm:pr-12 md:pr-16 lg:pr-24">
        <div className="w-full max-w-lg shrink-0">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200/90 bg-white/90 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] ring-1 ring-zinc-200/50 backdrop-blur-xl dark:border-white/10 dark:bg-black/80 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] dark:ring-white/5">
            <div ref={revealRootRef}>
              <div
                data-anime-login
                className="h-[3px] w-full bg-gradient-to-r from-amber-500 via-violet-500 to-sky-500 opacity-95 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.45)]"
              />

              <div className="px-7 py-8 sm:px-10 sm:py-10">
                <header data-anime-login className="mb-7 text-left">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
                    <IconSpark className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    Dádiva Go · Cliente
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-[1.7rem] dark:text-white">
                    Criar conta
                  </h1>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Cadastra-te para fazer pedidos e acompanhar o trabalho em curso.
                  </p>
                </header>

                <form
                  data-anime-login
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4"
                  aria-busy={loading}
                  autoComplete="on"
                >
                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 transition hover:border-amber-400/60 dark:border-white/10 dark:bg-white/5">
                    <span>
                      <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        Conta de empresa
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                        Activa para cadastrar uma pessoa jurídica.
                      </span>
                    </span>
                    <span className="relative inline-flex shrink-0">
                      <input
                        type="checkbox"
                        name="isCompany"
                        checked={isCompany}
                        onChange={(event) => {
                          setIsCompany(event.target.checked);
                          if (!event.target.checked) setNif("");
                        }}
                        disabled={loading}
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-zinc-300 transition peer-checked:bg-amber-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-500 peer-disabled:opacity-60 dark:bg-zinc-700" />
                      <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                    </span>
                  </label>

                  <div>
                    <label htmlFor="register-name" className={dadivaLabelAuth}>
                      {isCompany ? "Nome da empresa" : "Nome completo"}
                    </label>
                    <div className="relative">
                      <IconUser className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                      <input
                        id="register-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={120}
                        disabled={loading}
                        placeholder={
                          isCompany ? "Nome da empresa" : "O teu nome"
                        }
                        className={`${dadivaInputAuth} pl-11 pr-4`}
                        autoFocus
                      />
                    </div>
                  </div>

                  {isCompany ? (
                    <div>
                      <label htmlFor="register-nif" className={dadivaLabelAuth}>
                        NIF da empresa
                      </label>
                      <input
                        id="register-nif"
                        name="nif"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={nif}
                        onChange={(event) => setNif(event.target.value)}
                        required
                        maxLength={32}
                        disabled={loading}
                        placeholder="Número de identificação fiscal"
                        className={dadivaInputAuth}
                      />
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="register-phone" className={dadivaLabelAuth}>
                      Número de telefone
                    </label>
                    <div className="relative">
                      <IconPhone className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                      <input
                        id="register-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) =>
                          setPhone(formatWhatsAppMaskInput(event.target.value))
                        }
                        required
                        disabled={loading}
                        placeholder="+244 923 456 789"
                        className={`${dadivaInputAuth} pl-11 pr-4`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="register-password" className={dadivaLabelAuth}>
                      Palavra-passe
                    </label>
                    <div className="relative">
                      <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                      <input
                        id="register-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={8}
                        maxLength={72}
                        disabled={loading}
                        className={`${dadivaInputAuth} pl-11 pr-[4.25rem]`}
                      />
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-xs font-semibold text-zinc-500 underline-offset-2 transition hover:text-amber-700 hover:underline dark:text-zinc-400 dark:hover:text-amber-300"
                        aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                      >
                        {showPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Usa pelo menos 8 caracteres.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="register-confirm-password" className={dadivaLabelAuth}>
                      Confirmar palavra-passe
                    </label>
                    <div className="relative">
                      <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                      <input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                        minLength={8}
                        maxLength={72}
                        disabled={loading}
                        className={`${dadivaInputAuth} pl-11 pr-4`}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div
                      ref={errorRef}
                      className="rounded-xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800 dark:border-red-400/60 dark:bg-red-950 dark:text-red-200"
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className={dadivaBtnPrimaryAuth}
                  >
                    {loading ? (
                      <>
                        <span
                          ref={submitSpinnerRef}
                          className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-black/15 border-t-black/75 dark:border-white/25 dark:border-t-white"
                          aria-hidden
                        />
                        <span>A criar conta…</span>
                      </>
                    ) : (
                      "Criar conta"
                    )}
                  </button>
                </form>

                <div
                  data-anime-login
                  className="mt-6 border-t border-zinc-200/80 pt-5 text-center text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400"
                >
                  Já tens conta?{" "}
                  <Link
                    href={ROUTES.clientLogin}
                    className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                  >
                    Entrar
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
