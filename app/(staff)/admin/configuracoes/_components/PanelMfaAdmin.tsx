"use client";

import { useState } from "react";
import {
  beginMfaSetup,
  disableMfaSetup,
  enableMfaSetup,
  fetchMe,
} from "@/lib/api-client";
import { loadSession, saveSession } from "@/lib/auth-session";
import {
  FieldPassword,
  InfoCallout,
  SubPanel,
} from "./settings-ui";

export function PanelMfaAdmin() {
  const session = loadSession();
  const [mfaEnabled, setMfaEnabled] = useState(
    () => session?.user.mfaEnabled ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  async function refreshUserFlag() {
    try {
      const user = await fetchMe();
      setMfaEnabled(user.mfaEnabled);
      saveSession({ user });
    } catch {
      /* ignore */
    }
  }

  async function startSetup() {
    setBusy(true);
    setError(null);
    setRecoveryCodes(null);
    try {
      const data = await beginMfaSetup();
      setSetupSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await enableMfaSetup(confirmCode);
      setRecoveryCodes(data.recoveryCodes);
      setSetupSecret(null);
      setOtpauthUrl(null);
      setConfirmCode("");
      await refreshUserFlag();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await disableMfaSetup(disablePassword, disableCode);
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes(null);
      await refreshUserFlag();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desactivar.");
    } finally {
      setBusy(false);
    }
  }

  if (session?.user.role !== "ADMIN") {
    return null;
  }

  return (
    <SubPanel
      title="Autenticação em dois passos (MFA)"
      description="Protege contas ADMIN com TOTP (Google Authenticator, Authy, etc.)."
    >
      {session.user.mfaSetupRequired ? (
        <InfoCallout tone="info">
          A política de produção exige MFA nesta conta ADMIN. Active o TOTP
          abaixo para continuar a usar o restante do painel.
        </InfoCallout>
      ) : null}

      <InfoCallout tone={mfaEnabled ? "success" : "info"}>
        {mfaEnabled
          ? "MFA activo nesta conta. Será pedido um código em cada login."
          : "MFA desactivado. Recomendado activar antes de produção."}
      </InfoCallout>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {recoveryCodes ? (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            Guarda estes códigos de recuperação (só aparecem uma vez)
          </p>
          <ul className="grid gap-1 font-mono text-xs text-amber-100 sm:grid-cols-2">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!mfaEnabled && !setupSecret ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSetup()}
          className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
        >
          Activar MFA
        </button>
      ) : null}

      {setupSecret ? (
        <form onSubmit={confirmSetup} className="space-y-4">
          <p className="text-sm text-zinc-300">
            Adiciona esta chave na app autenticadora (entrada manual) ou abre o
            link otpauth no telemóvel:
          </p>
          <code className="block break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-amber-200">
            {setupSecret}
          </code>
          {otpauthUrl ? (
            <a
              href={otpauthUrl}
              className="inline-block text-xs font-semibold text-amber-400 underline"
            >
              Abrir na app autenticadora
            </a>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Código de confirmação
            </label>
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              className="w-full rounded-xl border border-zinc-700/60 bg-black/30 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-amber-400/50"
              placeholder="000000"
              minLength={6}
              required
              disabled={busy}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
          >
            Confirmar e activar
          </button>
        </form>
      ) : null}

      {mfaEnabled ? (
        <form onSubmit={disable} className="space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-400">Desactivar MFA (exige palavra-passe + código)</p>
          <FieldPassword
            label="Palavra-passe"
            value={disablePassword}
            onChange={setDisablePassword}
          />
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Código MFA
            </label>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className="w-full rounded-xl border border-zinc-700/60 bg-black/30 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-amber-400/50"
              placeholder="000000"
              minLength={6}
              required
              disabled={busy}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-50"
          >
            Desactivar MFA
          </button>
        </form>
      ) : null}
    </SubPanel>
  );
}
