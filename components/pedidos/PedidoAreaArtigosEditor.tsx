"use client";

import { memo } from "react";
import type { CatalogProduct } from "@/lib/api-client";
import {
  areaLineLabel,
  filterAreaCatalogProducts,
  parseDimension,
  type AreaLineForm,
} from "@/lib/area-pricing-catalog";
import { formatMoney } from "@/lib/format-money";
import { variantsForProduct } from "@/lib/pedido-generic-lines";
import { dadivaInput } from "@/lib/dadiva-ui-classes";
import type { PedidoArtigosEditorUiVariant } from "@/components/pedidos/PedidoArtigosEditor";

type Props = {
  catalog: CatalogProduct[] | null;
  areaSyncActive: boolean;
  lines: AreaLineForm[];
  activeLineCount: number;
  addLine: () => void;
  removeLine: (id: string) => void;
  patchLine: (id: string, patch: Partial<AreaLineForm>) => void;
  patchDimension: (lineId: string, field: "widthM" | "heightM", raw: string) => void;
  patchQty: (lineId: string, raw: string) => void;
  catalogUnavailableHint?: string | null;
  uiVariant?: PedidoArtigosEditorUiVariant;
  embedded?: boolean;
};

function theme(variant: PedidoArtigosEditorUiVariant) {
  if (variant === "pdvCompact") {
    const input = dadivaInput;
    return {
      wrap: "space-y-3",
      title: "text-sm font-bold text-zinc-900 dark:text-zinc-50",
      addBtn:
        "rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-400",
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
    ? "w-full rounded-lg border border-white/[0.12] bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/20"
    : dadivaInput;
  return {
    wrap: isConta
      ? "relative overflow-hidden space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4 shadow-[0_12px_48px_-18px_rgba(0,0,0,.5)] ring-1 ring-white/[0.04] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-orange-400 before:via-amber-500 before:to-lime-500 before:opacity-95 before:content-[''] sm:p-5"
      : "relative overflow-hidden space-y-4 rounded-2xl border border-zinc-200/85 bg-gradient-to-br from-white via-white to-orange-50/35 p-5 shadow-[0_14px_44px_-26px_rgba(251,146,60,0.18)] ring-1 ring-black/[0.03] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-orange-500 before:via-amber-500 before:to-lime-500 before:opacity-95 before:content-[''] dark:border-zinc-600/85 dark:from-zinc-900 dark:via-zinc-900 dark:to-orange-950/30 dark:shadow-black/35 dark:ring-white/[0.04] sm:p-6",
    title: isConta
      ? "flex items-center gap-2 text-base font-bold text-white"
      : "flex items-center gap-2 bg-gradient-to-r from-zinc-900 via-orange-900 to-amber-800 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-white dark:to-lime-400",
    addBtn: isConta
      ? "rounded-xl border border-orange-400/35 bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-2 text-xs font-bold text-white shadow-md transition hover:from-orange-400 hover:to-amber-400 disabled:opacity-45"
      : "rounded-xl bg-gradient-to-r from-orange-400 to-amber-500 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-lg shadow-orange-600/25 transition hover:-translate-y-px",
    hint: isConta
      ? "rounded-xl border border-orange-400/20 bg-orange-400/[0.06] px-3 py-2.5 text-xs leading-snug text-orange-100/90"
      : "rounded-lg border border-orange-300/40 bg-gradient-to-br from-orange-50 to-white px-3 py-2 text-xs leading-snug text-zinc-800 dark:border-orange-500/30 dark:from-orange-950/50 dark:to-zinc-900 dark:text-orange-50/95",
    lineCard: isConta
      ? "space-y-3 rounded-xl border border-white/[0.07] bg-black/30 p-4 ring-1 ring-white/[0.04]"
      : "space-y-3 rounded-xl border border-zinc-200/95 bg-white/95 p-3.5 shadow-sm ring-1 ring-zinc-200/50 dark:border-zinc-600/80 dark:bg-zinc-800/80 dark:ring-zinc-600/35",
    remove:
      "rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-500/12",
    label: "text-[10px] font-bold uppercase tracking-wide text-zinc-500",
    footer: "text-xs text-zinc-500",
    footerStrong: isConta ? "font-bold text-orange-300" : "font-bold text-zinc-900 dark:text-white",
    input,
  };
}

function PedidoAreaArtigosEditorInner({
  catalog,
  areaSyncActive,
  lines,
  activeLineCount,
  addLine,
  removeLine,
  patchLine,
  patchDimension,
  patchQty,
  catalogUnavailableHint,
  uiVariant = "conta",
  embedded = false,
}: Props) {
  const t = theme(uiVariant);
  const cat = catalog ?? [];
  const products = filterAreaCatalogProducts(cat);

  const header = embedded ? (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={addLine}
        disabled={!areaSyncActive}
        className={t.addBtn}
      >
        + Adicionar peça
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className={t.title}>Lona e Vinil</h2>
      <button
        type="button"
        onClick={addLine}
        disabled={!areaSyncActive}
        className={t.addBtn}
      >
        + Adicionar peça
      </button>
    </div>
  );

  return (
    <section className={embedded ? "space-y-3" : t.wrap}>
      {header}

      {!embedded && catalogUnavailableHint ? (
        <p className={t.hint}>{catalogUnavailableHint}</p>
      ) : !embedded && !areaSyncActive ? (
        <p className={t.hint}>
          Ainda não há Lona ou Vinil no catálogo. O administrador deve criar os
          produtos e activar variantes com preço por m².
        </p>
      ) : embedded && !areaSyncActive ? (
        <p className={t.hint}>Catálogo lona/vinil indisponível.</p>
      ) : !embedded ? (
        <p className={t.hint}>
          Indica <strong>altura</strong> e <strong>largura</strong> em metros.
          O total é calculado automaticamente: altura × largura × preço/m² ×
          quantidade de peças iguais.
        </p>
      ) : null}

      <div className="space-y-3">
        {lines.map((line, idx) => {
          const productVariants = line.productId
            ? variantsForProduct(cat, line.productId)
            : [];
          const label =
            line.variantId && cat.length ? areaLineLabel(cat, line) : null;
          const w = parseDimension(line.widthM);
          const h = parseDimension(line.heightM);
          const areaM2 =
            w != null && h != null ? Math.round(w * h * 1000) / 1000 : null;
          const lineTotal = parseFloat(line.lineTotal.replace(",", "."));

          return (
            <div key={line.id} className={t.lineCard}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Peça {idx + 1}
                  {label ? (
                    <span className="ml-2 font-normal text-zinc-500">
                      · {label}
                    </span>
                  ) : null}
                </span>
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={t.label}>Produto</span>
                  <select
                    value={line.productId}
                    disabled={!areaSyncActive}
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
                  <span className={t.label}>Tipo / acabamento</span>
                  <select
                    value={line.variantId}
                    disabled={!areaSyncActive || !line.productId}
                    onChange={(e) =>
                      patchLine(line.id, { variantId: e.target.value })
                    }
                    className={`${t.input} mt-1 w-full`}
                  >
                    <option value="">— Seleccionar —</option>
                    {productVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.size?.trim() || v.sku}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={t.label}>Largura (m)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.widthM}
                    disabled={!areaSyncActive}
                    onChange={(e) =>
                      patchDimension(line.id, "widthM", e.target.value)
                    }
                    placeholder="ex.: 2,5"
                    className={`${t.input} mt-1 w-full tabular-nums`}
                  />
                </label>

                <label className="block">
                  <span className={t.label}>Altura (m)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.heightM}
                    disabled={!areaSyncActive}
                    onChange={(e) =>
                      patchDimension(line.id, "heightM", e.target.value)
                    }
                    placeholder="ex.: 1"
                    className={`${t.input} mt-1 w-full tabular-nums`}
                  />
                </label>

                <label className="block">
                  <span className={t.label}>Quantidade (peças iguais)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.quantity}
                    disabled={!areaSyncActive}
                    onChange={(e) => patchQty(line.id, e.target.value)}
                    placeholder="1"
                    className={`${t.input} mt-1 w-full tabular-nums`}
                  />
                </label>

                <label className="block">
                  <span className={t.label}>Preço por m² (Kz)</span>
                  <input
                    type="text"
                    readOnly
                    value={line.pricePerM2}
                    className={`${t.input} mt-1 w-full tabular-nums opacity-80`}
                  />
                </label>
              </div>

              {areaM2 != null ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Área por peça:{" "}
                  <strong className="text-zinc-700 dark:text-zinc-200">
                    {areaM2} m²
                  </strong>
                </p>
              ) : null}

              {Number.isFinite(lineTotal) && lineTotal > 0 ? (
                <p className="text-right text-xs text-zinc-600 dark:text-zinc-400">
                  Subtotal:{" "}
                  <strong className="text-zinc-900 dark:text-white">
                    {formatMoney(lineTotal)} Kz
                  </strong>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {activeLineCount > 0 ? (
        <p className={t.footer}>
          Linhas com dimensões válidas:{" "}
          <span className={t.footerStrong}>{activeLineCount}</span>
        </p>
      ) : null}
    </section>
  );
}

export const PedidoAreaArtigosEditor = memo(PedidoAreaArtigosEditorInner);
