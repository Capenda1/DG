"use client";

import { memo, useMemo } from "react";
import type { CatalogProduct } from "@/lib/api-client";
import {
  filterGenericCatalogProducts,
  genericLineLabel,
  genericLineTotalPieces,
  variantsForProduct,
  type GenericLineForm,
} from "@/lib/pedido-generic-lines";
import { formatMoney } from "@/lib/format-money";
import { dadivaInput } from "@/lib/dadiva-ui-classes";
import type { PedidoArtigosEditorUiVariant } from "@/components/pedidos/PedidoArtigosEditor";
import { useCollapsiblePedidoLines } from "@/components/pedidos/useCollapsiblePedidoLines";

type Props = {
  catalog: CatalogProduct[] | null;
  genericSyncActive: boolean;
  lines: GenericLineForm[];
  grandTotalPieces: number;
  addLine: () => void;
  removeLine: (id: string) => void;
  patchLine: (id: string, patch: Partial<GenericLineForm>) => void;
  patchQty: (lineId: string, raw: string) => void;
  catalogUnavailableHint?: string | null;
  uiVariant?: PedidoArtigosEditorUiVariant;
  sectionTitle?: string;
  addLineButtonLabel?: string;
  embedded?: boolean;
};

function theme(variant: PedidoArtigosEditorUiVariant) {
  if (variant === "pdvCompact") {
    const input = dadivaInput;
    return {
      wrap: "space-y-3",
      title: "text-sm font-bold text-zinc-900 dark:text-zinc-50",
      addBtn:
        "rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400",
      hint: "rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      lineCard:
        "space-y-2.5 rounded-lg border border-zinc-200/90 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/60",
      remove: "text-xs font-bold text-red-700 dark:text-red-400",
      label:
        "text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400",
      footer: "text-xs text-zinc-600 dark:text-zinc-400",
      footerStrong: "font-bold text-zinc-900 dark:text-white",
      input,
    };
  }
  const isConta = variant === "conta";
  const input = isConta
    ? "w-full rounded-lg border border-white/[0.12] bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-100 outline-none transition focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/20"
    : dadivaInput;
  return {
    wrap: isConta
      ? "relative overflow-hidden space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4 shadow-[0_12px_48px_-18px_rgba(0,0,0,.5)] ring-1 ring-white/[0.04] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-400 before:via-blue-500 before:to-cyan-500 before:opacity-95 before:content-[''] sm:p-5"
      : "relative overflow-hidden space-y-4 rounded-2xl border border-zinc-200/85 bg-gradient-to-br from-white via-white to-indigo-50/35 p-5 shadow-[0_14px_44px_-26px_rgba(99,102,241,0.18)] ring-1 ring-black/[0.03] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-indigo-500 before:via-blue-500 before:to-cyan-500 before:opacity-95 before:content-[''] dark:border-zinc-600/85 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/30 dark:shadow-black/35 dark:ring-white/[0.04] sm:p-6",
    title: isConta
      ? "flex items-center gap-2 text-base font-bold text-white"
      : "flex items-center gap-2 bg-gradient-to-r from-zinc-900 via-indigo-900 to-blue-800 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-white dark:to-cyan-400",
    addBtn: isConta
      ? "rounded-xl border border-indigo-400/35 bg-gradient-to-r from-indigo-500 to-blue-500 px-3 py-2 text-xs font-bold text-white shadow-md transition hover:from-indigo-400 hover:to-blue-400 disabled:opacity-45"
      : "rounded-xl bg-gradient-to-r from-indigo-400 to-blue-500 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-lg shadow-indigo-600/25 transition hover:-translate-y-px",
    hint: isConta
      ? "rounded-xl border border-indigo-400/20 bg-indigo-400/[0.06] px-3 py-2.5 text-xs leading-snug text-indigo-100/90"
      : "rounded-lg border border-indigo-300/40 bg-gradient-to-br from-indigo-50 to-white px-3 py-2 text-xs leading-snug text-zinc-800 dark:border-indigo-500/30 dark:from-indigo-950/50 dark:to-zinc-900 dark:text-indigo-50/95",
    lineCard: isConta
      ? "space-y-3 rounded-xl border border-white/[0.07] bg-black/30 p-4 ring-1 ring-white/[0.04]"
      : "space-y-3 rounded-xl border border-zinc-200/95 bg-white/95 p-3.5 shadow-sm ring-1 ring-zinc-200/50 dark:border-zinc-600/80 dark:bg-zinc-800/80 dark:ring-zinc-600/35",
    remove:
      "rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-500/12",
    label: "text-[10px] font-bold uppercase tracking-wide text-zinc-500",
    footer: "text-xs text-zinc-500",
    footerStrong: isConta ? "font-bold text-indigo-300" : "font-bold text-zinc-900 dark:text-white",
    input,
  };
}

function PedidoGenericArtigosEditorInner({
  catalog,
  genericSyncActive,
  lines,
  grandTotalPieces,
  addLine,
  removeLine,
  patchLine,
  patchQty,
  catalogUnavailableHint,
  uiVariant = "conta",
  sectionTitle = "Canecas, cartões e impressão",
  addLineButtonLabel = "+ Adicionar artigo",
  embedded = false,
}: Props) {
  const t = theme(uiVariant);
  const cat = catalog ?? [];
  const products = filterGenericCatalogProducts(cat);
  const collapseEnabled =
    embedded || uiVariant === "pdvCompact" || uiVariant === "conta";
  const lineIds = useMemo(() => lines.map((l) => l.id), [lines]);
  const { isExpanded, expand, collapseActive } = useCollapsiblePedidoLines(
    lineIds,
    collapseEnabled,
  );

  const header = embedded ? (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={addLine}
        disabled={!genericSyncActive}
        className={t.addBtn}
      >
        {addLineButtonLabel}
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className={t.title}>{sectionTitle}</h2>
      <button
        type="button"
        onClick={addLine}
        disabled={!genericSyncActive}
        className={t.addBtn}
      >
        {addLineButtonLabel}
      </button>
    </div>
  );

  return (
    <section className={embedded ? "space-y-3" : t.wrap}>
      {header}

      {!embedded && catalogUnavailableHint ? (
        <p className={t.hint}>{catalogUnavailableHint}</p>
      ) : !embedded && !genericSyncActive ? (
        <p className={t.hint}>
          Ainda não há canecas nem impressão plana no catálogo. O administrador
          deve criar produtos (Caneca, Cartão de Visita, Passe PVC) e activar
          variantes.
        </p>
      ) : embedded && !genericSyncActive ? (
        <p className={t.hint}>Catálogo plano/caneca indisponível.</p>
      ) : !embedded ? (
        <p className={t.hint}>
          Escolhe o produto e a variante (formato, acabamento ou capacidade).
          Quantidade em unidades ou pacotes conforme a descrição da variante.
        </p>
      ) : null}

      <div className="space-y-3">
        {lines.map((line, idx) => {
          const productVariants = line.productId
            ? variantsForProduct(cat, line.productId)
            : [];
          const pieces = genericLineTotalPieces(line);
          const label =
            line.variantId && cat.length
              ? genericLineLabel(cat, line)
              : null;
          const unitPrice = parseFloat(line.unitPrice.replace(",", "."));
          const lineTotal =
            pieces > 0 && Number.isFinite(unitPrice) ? unitPrice * pieces : null;
          const expanded = isExpanded(line.id);

          return (
            <div
              key={line.id}
              className={
                collapseActive && !expanded
                  ? `${t.lineCard} !space-y-0 !py-2.5`
                  : t.lineCard
              }
            >
              <div className="flex items-center justify-between gap-2">
                {collapseActive ? (
                  <button
                    type="button"
                    onClick={() => expand(line.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Artigo {idx + 1}
                      {!expanded ? (
                        <span className="ml-2 font-normal text-zinc-500">
                          {label
                            ? `· ${label}`
                            : "· Minimizado — tocar para editar"}
                        </span>
                      ) : label ? (
                        <span className="ml-2 font-normal text-zinc-500">
                          · {label}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Artigo {idx + 1}
                    {label ? (
                      <span className="ml-2 font-normal text-zinc-500">
                        · {label}
                      </span>
                    ) : null}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {collapseActive && !expanded ? (
                    <button
                      type="button"
                      onClick={() => expand(line.id)}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400"
                    >
                      Editar
                    </button>
                  ) : null}
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className={t.remove}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>

              {expanded ? (
              <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={t.label}>Produto</span>
                  <select
                    value={line.productId}
                    disabled={!genericSyncActive}
                    onChange={(e) =>
                      patchLine(line.id, { productId: e.target.value })
                    }
                    className={`${t.input} mt-1 w-full`}
                  >
                    <option value="">— Seleccionar —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={t.label}>Variante</span>
                  <select
                    value={line.variantId}
                    disabled={!genericSyncActive || !line.productId}
                    onChange={(e) =>
                      patchLine(line.id, { variantId: e.target.value })
                    }
                    className={`${t.input} mt-1 w-full`}
                  >
                    <option value="">— Seleccionar —</option>
                    {productVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.size?.trim() || v.sku}
                        {v.baseColor ? ` · ${v.baseColor}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={t.label}>Quantidade</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.quantity}
                    disabled={!genericSyncActive}
                    onChange={(e) => patchQty(line.id, e.target.value)}
                    placeholder="0"
                    className={`${t.input} mt-1 w-full tabular-nums`}
                  />
                </label>

                <label className="block">
                  <span className={t.label}>Preço unitário (Kz)</span>
                  <input
                    type="text"
                    readOnly
                    value={line.unitPrice}
                    className={`${t.input} mt-1 w-full tabular-nums opacity-80`}
                  />
                </label>
              </div>

              {lineTotal != null ? (
                <p className="text-right text-xs text-zinc-600 dark:text-zinc-400">
                  Subtotal:{" "}
                  <strong className="text-zinc-900 dark:text-white">
                    {formatMoney(lineTotal)} Kz
                  </strong>
                </p>
              ) : null}
              </>
              ) : null}
            </div>
          );
        })}
      </div>

      {grandTotalPieces > 0 ? (
        <p className={t.footer}>
          Total peças / pacotes nesta secção:{" "}
          <span className={t.footerStrong}>{grandTotalPieces}</span>
        </p>
      ) : null}
    </section>
  );
}

export const PedidoGenericArtigosEditor = memo(PedidoGenericArtigosEditorInner);
