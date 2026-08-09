"use client";

/* eslint-disable @next/next/no-img-element -- comparação antes/depois com object URLs */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  restoreAndEnhanceImage,
  type RestoreImageStrength,
} from "@/lib/image-restore-enhance";
import { adminHomePathForRole, ROUTES } from "@/lib/routes";
import { loadSession } from "@/lib/auth-session";

export default function AdminRestaurarImagemPage() {
  const session = loadSession();
  const homeHref = adminHomePathForRole(session?.user?.role ?? "ADMIN");

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [upscale, setUpscale] = useState<1 | 1.5 | 2>(2);
  const [strength, setStrength] = useState<RestoreImageStrength>("normal");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => {
    sourceUrlRef.current = sourceUrl;
  }, [sourceUrl]);

  useEffect(() => {
    resultUrlRef.current = resultUrl;
  }, [resultUrl]);

  const revokeSource = useCallback(() => {
    const u = sourceUrlRef.current;
    if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
    sourceUrlRef.current = null;
    sourceFileRef.current = null;
    setSourceUrl(null);
  }, []);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      setErr(null);
      setResultUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      revokeSource();
      if (!f?.type.startsWith("image/") || f.type === "image/svg+xml") {
        setErr("Escolha um PNG ou JPG/WebP raster. SVG não é suportado.");
        return;
      }
      sourceFileRef.current = f;
      const url = URL.createObjectURL(f);
      sourceUrlRef.current = url;
      setSourceUrl(url);
      setSourceName(f.name.replace(/\.[^.]+$/, "") || "imagem");
    },
    [revokeSource],
  );

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(sourceUrlRef.current);
      }
      if (resultUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  const runRestore = useCallback(async () => {
    if (!sourceUrl || busy) return;

    setBusy(true);
    setErr(null);
    setResultUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });

    try {
      const out = await restoreAndEnhanceImage(sourceUrl, {
        upscaleFactor: upscale,
        strength,
      });
      setResultUrl(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível processar.");
    } finally {
      setBusy(false);
    }
  }, [busy, sourceUrl, strength, upscale]);

  const downloadHref = resultUrl ?? undefined;
  const downloadName =
    `${sourceName || "imagem"}-melhorada-local.png`.replace(/[/\\]/g, "-");

  return (
    <div className="p-6 sm:p-8">
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/95 via-zinc-900/55 to-teal-950/20 px-6 py-8 sm:px-10">
        <div className="pointer-events-none absolute -left-24 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-400/90">
          Ferramentas
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Restaurar e melhorar imagem
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Tudo corre <strong className="font-medium text-zinc-300">no seu navegador</strong>
          : contraste em luminância, nitidez e ampliação em passos — gratuito e sem enviar
          o ficheiro para servidores externos.
        </p>
        <Link
          href={homeHref}
          className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-amber-400/90 underline-offset-4 hover:text-amber-300 hover:underline"
        >
          ← Voltar ao início da área
        </Link>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr,minmax(0,340px)]">
        <div className="space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 sm:p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-600/50 bg-black/35 px-4 py-10 transition hover:border-teal-500/35 hover:bg-teal-950/15">
            <span className="text-sm font-semibold text-zinc-200">
              Clique para escolher imagem
            </span>
            <span className="text-center text-[11px] text-zinc-500">
              PNG, JPEG ou WebP
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="sr-only"
              onChange={onPickFile}
            />
          </label>

          {sourceUrl ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Original
                </p>
                <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:12px_12px]">
                  <img
                    src={sourceUrl}
                    alt="Original"
                    className="mx-auto max-h-64 w-full object-contain"
                  />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Resultado
                </p>
                <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:12px_12px]">
                  {resultUrl ? (
                    <img
                      src={resultUrl}
                      alt="Melhorada"
                      className="mx-auto max-h-64 w-full object-contain"
                    />
                  ) : (
                    <div className="flex min-h-[8rem] items-center justify-center px-4 py-10 text-center text-[11px] text-zinc-600">
                      {busy ? (
                        <>A processar…</>
                      ) : (
                        <>
                          Pré‑visualização após clicar em Aplicar melhorias.
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-[11px] text-zinc-600">
              Ainda não há ficheiro. Escolha uma imagem em cima.
            </p>
          )}

          {err && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-200"
            >
              {err}
            </div>
          )}
        </div>

        <div className="h-fit space-y-4 rounded-2xl border border-teal-500/22 bg-teal-950/12 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/85">
            Opções
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-400">
              Ampliação
            </span>
            <select
              value={String(upscale)}
              disabled={busy}
              onChange={(e) =>
                setUpscale(Number(e.target.value) as 1 | 1.5 | 2)
              }
              className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400/40"
            >
              <option value="1">×1 — só correção</option>
              <option value="1.5">×1,5</option>
              <option value="2">×2 — mais pixels</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-400">
              Intensidade
            </span>
            <select
              value={strength}
              disabled={busy}
              onChange={(e) =>
                setStrength(e.target.value as RestoreImageStrength)
              }
              className="rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-teal-400/40"
            >
              <option value="subtle">Suave</option>
              <option value="normal">Normal</option>
              <option value="strong">Forte</option>
            </select>
          </label>

          <button
            type="button"
            disabled={!sourceUrl || busy}
            onClick={() => void runRestore()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500/90 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
                A processar…
              </>
            ) : (
              "Aplicar melhorias"
            )}
          </button>

          <a
            href={downloadHref}
            download={downloadName}
            className={`flex w-full items-center justify-center rounded-xl border border-white/15 py-3 text-sm font-semibold transition ${
              resultUrl
                ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20"
                : "pointer-events-none cursor-not-allowed border-zinc-800 text-zinc-600"
            }`}
          >
            Descarregar ficheiro
          </a>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Para a modelagem num pedido: descarregar e voltar a fazer upload ao
            cliente.{" "}
            <Link href={ROUTES.accountPedidos} className="text-zinc-500 underline-offset-2 hover:text-teal-300 hover:underline">
              Área do cliente → pedidos
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
