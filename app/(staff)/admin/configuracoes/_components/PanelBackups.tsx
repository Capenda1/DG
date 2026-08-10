"use client";

import { useState } from "react";
import {
  createAdminBackup,
  downloadAdminBackup,
  triggerBrowserDownload,
  type AdminBackupKind,
} from "@/lib/api-client";
import { InfoCallout, SubPanel } from "./settings-ui";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PanelBackups() {
  const [busy, setBusy] = useState<AdminBackupKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: AdminBackupKind) {
    setBusy(kind);
    setMessage(null);
    setError(null);
    try {
      const { files } = await createAdminBackup(kind);
      for (const file of files) {
        const blob = await downloadAdminBackup(file.name);
        triggerBrowserDownload(blob, file.name);
      }
      const labels = files
        .map((f) => `${f.name} (${formatBytes(f.sizeBytes)})`)
        .join(", ");
      setMessage(
        `Download iniciado: ${labels}. Guarde o(s) ficheiro(s) numa memória externa (USB/disco).`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível criar o backup.",
      );
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60";

  return (
    <div className="space-y-5">
      <InfoCallout tone="info">
        Os backups são gerados no servidor e <strong>descarregados para este
        computador</strong>. Guarde-os numa memória externa (USB ou disco). Não
        ficam guardados de forma permanente no VPS.
      </InfoCallout>

      <SubPanel
        title="Criar e descarregar"
        description="Base de dados PostgreSQL e ficheiros enviados (uploads / modelagem)."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("database")}
            className={`${btn} bg-amber-400 text-zinc-950 hover:bg-amber-300`}
          >
            {busy === "database" ? "A gerar…" : "Backup base de dados"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("uploads")}
            className={`${btn} border border-white/15 bg-white/5 text-zinc-100 hover:bg-white/10`}
          >
            {busy === "uploads" ? "A gerar…" : "Backup ficheiros (uploads)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("full")}
            className={`${btn} border border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20`}
          >
            {busy === "full" ? "A gerar…" : "Backup completo"}
          </button>
        </div>

        {message ? (
          <p className="mt-4 text-sm text-emerald-300/90">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-300/90">{error}</p>
        ) : null}
      </SubPanel>
    </div>
  );
}
