"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  novoModelagemLinhaVazia,
  parseModelagemSpecsFromOrder,
  toPayloadParsed,
  type ModelagemSpecLado,
  type ModelagemSpecLinhaEditor,
  type ParsedModelagemSpecs,
} from "@/lib/modelagem-specs";
import {
  downloadModelagemSpecsExcelCsv,
  downloadModelagemSpecsPdf,
  modelagemSpecsHasExportableContent,
} from "@/lib/modelagem-specs-export";
import {
  updateOrderModelagemSpecs,
  type OrderDetail,
} from "@/lib/api-client";

const LADO_OPTS: { value: ModelagemSpecLado; label: string }[] = [
  { value: "AMBOS", label: "Ambos os lados" },
  { value: "FRENTE", label: "Só frente" },
  { value: "VERSO", label: "Só verso / costas" },
];

type Props = {
  orderId: string;
  orderNumber: string;
  modelagemSpecs: unknown | null | undefined;
  canEdit: boolean;
  /** Sem borda exterior — dentro de accordion na modelagem. */
  embedded?: boolean;
  /** Actualiza estado do pedido após PATCH (normalmente `setOrder`). */
  onSaved: (order: OrderDetail) => void;
  onToast?: (message: string) => void;
};

export function ModelagemSpecsCard({
  orderId,
  orderNumber,
  modelagemSpecs,
  canEdit,
  embedded = false,
  onSaved,
  onToast,
}: Props) {
  const inicial = useMemo(
    () => parseModelagemSpecsFromOrder(modelagemSpecs),
    [modelagemSpecs],
  );

  const [textoExtra, setTextoExtra] = useState(inicial.textoExtra);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [linhasDraft, setLinhasDraft] = useState<ModelagemSpecLinhaEditor[]>(
    inicial.linhas,
  );
  const [aGuardar, setAGuardar] = useState(false);

  useEffect(() => {
    setTextoExtra(inicial.textoExtra);
    setLinhasDraft(inicial.linhas);
  }, [inicial.textoExtra, inicial.linhas, modelagemSpecs]);

  const aoAbrirDialogo = useCallback(() => {
    setLinhasDraft(
      inicial.linhas.length ? inicial.linhas : [novoModelagemLinhaVazia()],
    );
    setDialogAberto(true);
  }, [inicial.linhas]);

  const adicionarLinha = useCallback(() => {
    setLinhasDraft((prev) => [...prev, novoModelagemLinhaVazia()]);
  }, []);

  const removerLinha = useCallback((id: string) => {
    setLinhasDraft((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const actualizarLinha = useCallback(
    (id: string, patch: Partial<ModelagemSpecLinhaEditor>) => {
      setLinhasDraft((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      );
    },
    [],
  );

  const guardarPayload = useCallback(
    async (payload: ReturnType<typeof toPayloadParsed>, msg: string) => {
      setAGuardar(true);
      try {
        const atualizado = await updateOrderModelagemSpecs(orderId, payload);
        onSaved(atualizado);
        onToast?.(msg);
        return true;
      } catch (e) {
        onToast?.(
          e instanceof Error ? e.message : "Não foi possível guardar.",
        );
        return false;
      } finally {
        setAGuardar(false);
      }
    },
    [orderId, onSaved, onToast],
  );

  const guardarTudo = useCallback(async () => {
    const payload = toPayloadParsed(textoExtra, linhasDraft);
    const ok = await guardarPayload(payload, "Especificações guardadas.");
    if (ok) setDialogAberto(false);
  }, [textoExtra, linhasDraft, guardarPayload]);

  const guardarSoTexto = useCallback(async () => {
    await guardarPayload(
      toPayloadParsed(textoExtra, inicial.linhas),
      "Texto e linhas actuais guardados.",
    );
  }, [textoExtra, inicial.linhas, guardarPayload]);

  const numLinhas = inicial.linhas.length;

  const efectivoParaExportar = useMemo((): ParsedModelagemSpecs => {
    return {
      textoExtra,
      linhas: dialogAberto ? linhasDraft : inicial.linhas,
    };
  }, [textoExtra, dialogAberto, linhasDraft, inicial.linhas]);

  const podeExportarFicheiro =
    modelagemSpecsHasExportableContent(efectivoParaExportar);

  return (
    <div
      className={
        embedded
          ? "text-[13px] leading-relaxed text-teal-50/95"
          : "rounded-2xl border border-teal-500/35 bg-teal-950/20 px-4 py-3 text-[13px] leading-relaxed text-teal-50/95 ring-1 ring-teal-400/18"
      }
    >
      {!embedded ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-400/90">
            Informação extra de produção
          </p>
          <p className="mt-1 text-[11px] text-teal-200/75">
            Útil para várias peças ou frente/verso diferentes na mesma encomenda.
            O texto livre fica aqui; o quadro por linhas abre num formulário.
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-black/35 px-2 py-1 text-[10px] tabular-nums text-teal-300/85 ring-1 ring-white/[0.08]">
          {numLinhas} linha{numLinhas !== 1 ? "s" : ""}
          {" "}detalhada{numLinhas !== 1 ? "s" : ""}
        </span>
      </div>
      ) : (
        <p className="text-[11px] text-teal-200/75">
          Notas opcionais para a equipa (várias peças, frente/verso, Pantone, etc.).
        </p>
      )}

      <label className="mt-3 block">
        <span className="sr-only">Notas e informação adicional</span>
        <textarea
          value={textoExtra}
          onChange={(e) => setTextoExtra(e.target.value)}
          readOnly={!canEdit}
          disabled={!canEdit}
          rows={3}
          placeholder="Ex.: referências Pantone, instruções gerais ou nomes quando mistura vários modelos na mesma arte."
          className="mt-1 w-full resize-y rounded-xl border border-white/[0.1] bg-black/40 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-teal-400/40 focus:outline-none focus:ring-1 focus:ring-teal-400/35 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={aGuardar}
            onClick={() => void guardarSoTexto()}
            className="rounded-xl border border-white/[0.12] px-4 py-2 text-xs font-semibold text-teal-100 transition hover:bg-white/[0.06] disabled:opacity-50"
          >
            {aGuardar ? "…" : "Guardar texto (e linhas actuais)"}
          </button>
          <button
            type="button"
            onClick={aoAbrirDialogo}
            className="rounded-xl bg-teal-500/85 px-4 py-2 text-xs font-semibold text-teal-950 shadow-sm transition hover:bg-teal-400"
          >
            Gerir linhas (nome · tamanho · cor · verso)
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">
          Só visualização nesta fase — a equipa interna pode editar conforme
          permissões.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
        <button
          type="button"
          disabled={!podeExportarFicheiro}
          title={
            podeExportarFicheiro
              ? "Exporta texto e quadro por linhas (inclui alterações não guardadas ao ecrã actual)"
              : "Preencha notas livres ou linhas no formulário primeiro."
          }
          onClick={() => {
            void downloadModelagemSpecsPdf(efectivoParaExportar, orderNumber);
            onToast?.("PDF das especificações descarregado.");
          }}
          className="rounded-xl border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exportar PDF
        </button>
        <button
          type="button"
          disabled={!podeExportarFicheiro}
          title={
            podeExportarFicheiro
              ? "CSV com separador de colunas compatível com Excel — mesmos dados que o PDF"
              : "Preencha notas livres ou linhas no formulário primeiro."
          }
          onClick={() => {
            void downloadModelagemSpecsExcelCsv(efectivoParaExportar, orderNumber);
            onToast?.("Ficheiro Excel (CSV) descarregado.");
          }}
          className="rounded-xl border border-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exportar Excel (CSV)
        </button>
      </div>

      {dialogAberto ? (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-3 py-8 sm:items-center sm:py-12"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modelagem-specs-dialog-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            aria-label="Fechar"
            onClick={() => setDialogAberto(false)}
          />
          <div className="relative z-[81] mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950 shadow-2xl ring-1 ring-white/[0.06]">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2
                  id="modelagem-specs-dialog-title"
                  className="text-base font-semibold text-white"
                >
                  Linhas por peça / variante
                </h2>
                <p className="mt-1 text-[12px] text-zinc-500">
                  Cada linha: nome, tamanho, cor, info adicional e lado da impressão.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogAberto(false)}
                className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
                aria-label="Fechar formulário"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[min(72vh,640px)] overflow-x-auto overflow-y-auto px-4 py-4 sm:px-5">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-2 pr-2 font-medium">Nome</th>
                    <th className="py-2 pr-2 font-medium">Tamanho</th>
                    <th className="py-2 pr-2 font-medium">Cor</th>
                    <th className="py-2 pr-2 font-medium">Info adicional</th>
                    <th className="py-2 pr-2 font-medium">Lado</th>
                    <th className="w-24 py-2 pr-0 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {linhasDraft.map((linha) => (
                    <tr
                      key={linha.id}
                      className="border-b border-white/[0.04] align-top"
                    >
                      <td className="py-2 pr-2">
                        <input
                          value={linha.nome}
                          onChange={(e) =>
                            actualizarLinha(linha.id, { nome: e.target.value })
                          }
                          placeholder="Ex.: Ana Silva"
                          className="w-full min-w-[7rem] rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-zinc-100 placeholder:text-zinc-600"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={linha.tamanho}
                          onChange={(e) =>
                            actualizarLinha(linha.id, {
                              tamanho: e.target.value,
                            })
                          }
                          placeholder="M, L…"
                          className="w-full min-w-[5rem] rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-zinc-100"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={linha.cor}
                          onChange={(e) =>
                            actualizarLinha(linha.id, { cor: e.target.value })
                          }
                          placeholder="Cor da peça"
                          className="w-full min-w-[5rem] rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-zinc-100"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={linha.infoAdicional}
                          onChange={(e) =>
                            actualizarLinha(linha.id, {
                              infoAdicional: e.target.value,
                            })
                          }
                          placeholder="Notas"
                          className="w-full min-w-[8rem] rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-zinc-100"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={linha.lado}
                          onChange={(e) =>
                            actualizarLinha(linha.id, {
                              lado: e.target.value as ModelagemSpecLado,
                            })
                          }
                          className="w-full rounded-lg border border-white/[0.1] bg-black/40 px-2 py-1.5 text-zinc-100"
                        >
                          {LADO_OPTS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removerLinha(linha.id)}
                          disabled={linhasDraft.length <= 1}
                          className="text-[11px] font-medium text-rose-400/90 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={adicionarLinha}
                className="mt-4 rounded-lg border border-teal-500/35 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-200 transition hover:bg-teal-500/20"
              >
                + Adicionar linha
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] bg-black/40 px-5 py-3">
              <button
                type="button"
                onClick={() => setDialogAberto(false)}
                className="rounded-xl border border-white/[0.12] px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-zinc-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={aGuardar}
                onClick={() => void guardarTudo()}
                className="rounded-xl bg-amber-500/90 px-4 py-2 text-xs font-semibold text-zinc-950 shadow-sm disabled:opacity-50"
              >
                {aGuardar ? "A guardar…" : "Guardar tudo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
