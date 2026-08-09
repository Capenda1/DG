"use client";

import { memo } from "react";
import type { CatalogProduct } from "@/lib/api-client";
import {
  APPAREL_COLORS,
  APPAREL_COLOR_PREVIEW_HEX,
  APPAREL_PRODUCT_TYPES,
  allowedAgeBands,
  allowedBrands,
  allowedProcessesForColor,
  allowedSizes,
  colorRequiresDtfOnly,
  normalizeProductionProcessForColor,
  type ApparelAgeBand,
  type ApparelBrandId,
  type ApparelColorId,
  type ApparelProductType,
  type ProductionProcess,
} from "@/lib/apparel-catalog";
import {
  apparelLineSummaryLabel,
  catalogColorIdsInStock,
  findCatalogVariantForSelection,
  findFirstCatalogVariantForLine,
  lineTotalPieces,
  type LineForm,
} from "@/lib/pedido-artigos-lines";
import { dadivaInput } from "@/lib/dadiva-ui-classes";

export type PedidoArtigosEditorUiVariant =
  | "dark"
  | "pdvLight"
  | "pdvCompact"
  | "conta";

type Theme = {
  wrap: string;
  title: string;
  addBtn: string;
  hint: string;
  lineCard: string;
  lineMeta: string;
  lineAccent: string;
  remove: string;
  input: string;
  inputReadonly: string;
  qty: string;
  qtySelected: string;
  label: string;
  badge: string;
  sizeHint: string;
  sizeGridWrap: string;
  sizeLabelAvail: string;
  sizeLabelBlock: string;
  footer: string;
  footerStrong: string;
  helpZinc: string;
  dtfNote: string;
  lineGrid: string;
  lineSummary: string;
};

function editorTheme(variant: PedidoArtigosEditorUiVariant): Theme {
  if (variant === "pdvCompact") {
    const input = dadivaInput;
    const qty =
      "w-full min-w-0 rounded-lg border border-zinc-300/90 bg-white px-1.5 py-1.5 text-center text-xs tabular-nums text-zinc-900 focus:border-amber-500/55 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
    return {
      wrap: "space-y-3",
      title: "text-sm font-bold text-zinc-900 dark:text-zinc-50",
      addBtn:
        "rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400",
      hint: "rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      lineCard:
        "space-y-2.5 rounded-lg border border-zinc-200/90 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/60",
      lineMeta: "text-xs font-medium text-zinc-600 dark:text-zinc-400",
      lineAccent: "font-semibold text-zinc-900 dark:text-zinc-100",
      remove: "text-xs font-bold text-red-700 dark:text-red-400",
      input,
      inputReadonly: `${input} cursor-not-allowed bg-zinc-100 dark:bg-zinc-800`,
      qty,
      qtySelected: "border-amber-400/50 bg-amber-50 dark:bg-amber-950/30",
      label:
        "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400",
      badge:
        "mr-1 inline-flex h-5 w-5 items-center justify-center rounded bg-amber-200 text-[9px] font-bold text-amber-950",
      sizeHint: "text-[11px] text-zinc-500 dark:text-zinc-400",
      sizeGridWrap:
        "overflow-x-auto rounded-lg border border-dashed border-zinc-300 p-2 dark:border-zinc-600",
      sizeLabelAvail: "text-zinc-600 dark:text-zinc-400",
      sizeLabelBlock: "text-zinc-400 line-through",
      footer: "text-center text-xs text-zinc-600 dark:text-zinc-400",
      footerStrong: "font-bold text-amber-700 dark:text-amber-400",
      helpZinc: "mt-1 text-[11px] text-zinc-500",
      dtfNote: "mt-1 text-[11px] text-zinc-700 dark:text-zinc-300",
      lineGrid: "grid gap-2 sm:grid-cols-2",
      lineSummary: "",
    };
  }
  const isConta = variant === "conta";
  if (variant === "pdvLight" || isConta) {
    const input = isConta
      ? "w-full rounded-lg border border-white/[0.12] bg-zinc-950/60 px-2.5 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
      : dadivaInput;
    const qty = isConta
      ? "w-full min-w-0 min-h-[2.75rem] rounded-lg border border-white/[0.12] bg-zinc-950/60 px-1.5 py-2 text-center text-sm tabular-nums text-zinc-100 outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
      : "w-full min-w-0 rounded-lg border border-zinc-300/90 bg-white px-1.5 py-1.5 text-center text-xs tabular-nums leading-none text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-amber-500/55 focus:shadow-[0_0_0_2px_rgba(251,191,36,0.15)] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-amber-400/55 dark:focus:shadow-[0_0_0_2px_rgba(251,191,36,0.1)]";
    return {
      wrap: isConta
        ? "relative overflow-hidden space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4 shadow-[0_12px_48px_-18px_rgba(0,0,0,.5)] ring-1 ring-white/[0.04] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-amber-400 before:via-orange-500 before:to-violet-500 before:opacity-95 before:content-[''] sm:p-5"
        : "relative overflow-hidden space-y-4 rounded-2xl border border-zinc-200/85 bg-gradient-to-br from-white via-white to-amber-50/40 p-5 shadow-[0_14px_44px_-26px_rgba(245,158,11,0.2)] ring-1 ring-black/[0.03] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-amber-500 before:via-orange-500 before:to-violet-500 before:opacity-95 before:content-[''] dark:border-zinc-600/85 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/30 dark:shadow-black/35 dark:ring-white/[0.04] sm:p-6",

      title: isConta
        ? "flex items-center gap-2 text-base font-bold tracking-tight text-white"
        : "flex items-center gap-2 bg-gradient-to-r from-zinc-900 via-zinc-800 to-amber-800 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-white dark:via-white dark:to-amber-400",
      addBtn: isConta
        ? "rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-45"
        : "rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-black shadow-lg shadow-amber-600/30 ring-1 ring-black/10 transition hover:-translate-y-px hover:from-amber-300 hover:to-amber-400 dark:ring-white/20",
      hint: isConta
        ? "rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-snug text-amber-100/90"
        : "rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-50/90 to-white px-4 py-3 text-sm text-zinc-800 shadow-inner shadow-amber-900/5 dark:border-amber-500/25 dark:from-amber-950/40 dark:to-zinc-900 dark:text-amber-50/95",
      lineCard: isConta
        ? "space-y-3 rounded-xl border border-white/[0.07] bg-black/30 p-4 ring-1 ring-white/[0.04]"
        : "space-y-4 rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white to-zinc-50/95 p-4 shadow-md shadow-zinc-900/5 ring-1 ring-zinc-200/50 transition-shadow hover:shadow-lg dark:border-zinc-600 dark:from-zinc-800/90 dark:to-zinc-900/95 dark:ring-zinc-600/40",
      lineMeta: isConta
        ? "text-xs font-medium text-zinc-400"
        : "text-xs font-medium text-zinc-600 dark:text-zinc-400",
      lineAccent: isConta
        ? "font-semibold text-amber-300"
        : "font-semibold text-zinc-900 dark:text-zinc-100",
      remove:
        "rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-red-400 transition hover:bg-red-500/12 hover:text-red-300",
      input,
      inputReadonly: isConta
        ? `${input} cursor-not-allowed opacity-80`
        : `${input} cursor-not-allowed bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`,
      qty,
      qtySelected: isConta
        ? "border-amber-400/60 bg-amber-400/15 ring-1 ring-amber-400/35"
        : "border-amber-400/50 bg-amber-400/10 ring-1 ring-amber-400/25 dark:bg-amber-400/10",
      label: isConta
        ? "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
        : "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400",
      badge: isConta
        ? "mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-amber-400/20 text-[9px] font-extrabold text-amber-300 ring-1 ring-amber-400/30"
        : "mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-200/90 to-orange-300/95 text-[10px] font-extrabold text-amber-950 shadow-sm ring-1 ring-amber-400/35 dark:from-amber-500/30 dark:to-orange-600/40 dark:text-amber-100 dark:ring-amber-400/25",
      sizeHint: "text-[11px] text-zinc-500",
      sizeGridWrap: isConta
        ? "overflow-x-auto rounded-xl border border-dashed border-amber-400/25 bg-black/25 p-2"
        : "overflow-x-auto rounded-xl border-2 border-dashed border-amber-400/35 bg-gradient-to-br from-white to-amber-50/30 p-3 shadow-inner dark:border-amber-500/30 dark:from-zinc-900 dark:to-amber-950/20",
      sizeLabelAvail: isConta ? "text-zinc-400" : "text-zinc-600 dark:text-zinc-400",
      sizeLabelBlock: "text-zinc-600 line-through dark:text-zinc-600",
      footer: isConta
        ? "rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-center text-xs text-zinc-500"
        : "rounded-xl border border-zinc-200/80 bg-gradient-to-r from-white to-zinc-50/95 px-3 py-2.5 text-center text-xs text-zinc-600 shadow-inner shadow-zinc-900/5 dark:border-zinc-600 dark:from-zinc-800/60 dark:to-zinc-900 dark:text-zinc-400",
      footerStrong: "font-bold text-amber-300 tabular-nums",
      helpZinc: "mt-1 text-[11px] text-zinc-500",
      dtfNote: isConta
        ? "mt-1 text-[11px] font-medium text-amber-200/80"
        : "mt-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300",
      lineGrid: isConta ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2",
      lineSummary: isConta
        ? "rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2 text-[11px] leading-snug text-emerald-100/90"
        : "",
    };
  }

  const input =
    "w-full rounded-lg border border-zinc-700/40 bg-gradient-to-b from-zinc-900/50 to-zinc-950/80 px-2.5 py-2 text-[13px] leading-snug text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-zinc-600 hover:border-zinc-600/50 focus:border-amber-500/45 focus:from-zinc-900/70 focus:to-zinc-950 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.11),inset_0_1px_0_rgba(255,255,255,0.05)]";
  const qty =
    "w-full min-w-0 rounded-md border border-zinc-700/40 bg-gradient-to-b from-zinc-900/55 to-zinc-950/85 px-1.5 py-1.5 text-center text-xs tabular-nums leading-none text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-zinc-600 focus:border-amber-500/45 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.1)]";
  return {
    wrap: "space-y-4 rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-5 sm:p-6",
    title: "text-sm font-semibold text-white",
    addBtn:
      "rounded-lg border border-zinc-600/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300",
    hint: "rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90",
    lineCard: "space-y-4 rounded-xl border border-white/[0.06] bg-black/40 p-4",
    lineMeta: "text-xs font-medium text-zinc-500",
    lineAccent: "text-amber-400/90",
    remove: "text-xs text-red-400/90 hover:text-red-300",
    input,
    inputReadonly: `${input} cursor-not-allowed bg-zinc-950/80 text-zinc-400`,
    qty,
    qtySelected: "border-amber-400/70 bg-amber-500/10 ring-2 ring-amber-500/30",
    label:
      "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500",
    badge:
      "mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-[10px] font-bold text-emerald-300",
    sizeHint: "text-[11px] text-zinc-500",
    sizeGridWrap:
      "overflow-x-auto rounded-xl border border-white/[0.06] bg-black/50 p-3",
    sizeLabelAvail: "text-zinc-500",
    sizeLabelBlock: "text-zinc-600 line-through",
    footer: "text-center text-xs text-zinc-500",
    footerStrong: "font-semibold text-amber-400",
    helpZinc: "mt-1 text-[11px] text-zinc-500",
    dtfNote: "mt-1 text-[11px] text-amber-200/90",
    lineGrid: "grid gap-3 sm:grid-cols-2",
    lineSummary: "",
  };
}

export type PedidoArtigosEditorProps = {
  catalog: CatalogProduct[] | null;
  catalogSyncActive: boolean;
  lines: LineForm[];
  grandTotalPieces: number;
  addLine: () => void;
  removeLine: (id: string) => void;
  patchLine: (id: string, patch: Partial<LineForm>) => void;
  patchSizeQty: (lineId: string, size: string, raw: string) => void;
  /** Mensagem quando o catálogo ainda não tem variantes (opcional). */
  catalogUnavailableHint?: string | null;
  className?: string;
  /** Tema visual: `pdvLight` (balcão), `conta` (novo pedido cliente), `dark` (legado). */
  uiVariant?: PedidoArtigosEditorUiVariant;
  /** Título da secção (ex.: «Artigos do pedido»). */
  sectionTitle?: string;
  /** Rótulo do botão de nova linha (ex.: «+ Adicionar artigo»). */
  addLineButtonLabel?: string;
  /** Sem cabeçalho de secção — uso dentro de tabs PDV. */
  embedded?: boolean;
};

function PedidoArtigosEditorInner({
  catalog,
  catalogSyncActive,
  lines,
  grandTotalPieces,
  addLine,
  removeLine,
  patchLine,
  patchSizeQty,
  catalogUnavailableHint,
  className = "",
  uiVariant = "dark",
  sectionTitle = "Artigos",
  addLineButtonLabel = "+ Artigo",
  embedded = false,
}: PedidoArtigosEditorProps) {
  const cat = catalogSyncActive && catalog ? catalog : null;
  const t = editorTheme(uiVariant);
  const isLight =
    uiVariant === "pdvLight" || uiVariant === "conta" || uiVariant === "pdvCompact";

  const header = embedded ? (
    <div className="flex justify-end">
      <button type="button" onClick={addLine} className={t.addBtn}>
        {addLineButtonLabel}
      </button>
    </div>
  ) : (
    <div
      className={`flex flex-wrap items-center justify-between ${uiVariant === "conta" ? "gap-1.5" : "gap-2"}`}
    >
      <h2 className={`${t.title} ${isLight ? "min-w-0 flex-1" : ""}`}>
        {isLight && uiVariant !== "pdvCompact" ? (
          <span
            className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-600/30 ring-1 ring-black/10 dark:ring-white/15 ${uiVariant === "conta" ? "h-8 w-8" : "h-9 w-9"}`}
            aria-hidden
          >
            <svg
              className={
                uiVariant === "conta" ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]"
              }
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.85}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 7.5l1.5-3h7.5l1.5 3M9 7.5V6a3 3 0 116 0v1.5m-7.5 0h10.5v12a1.5 1.5 0 01-1.5 1.5h-7.5a1.5 1.5 0 01-1.5-1.5v-12z"
              />
            </svg>
          </span>
        ) : null}
        <span className="leading-snug">{sectionTitle}</span>
      </h2>
      <button type="button" onClick={addLine} className={t.addBtn}>
        {addLineButtonLabel}
      </button>
    </div>
  );

  return (
    <div className={`${embedded ? "space-y-3" : t.wrap} ${className}`}>
      {header}

      {!embedded && catalogUnavailableHint ? (
        <p className={t.hint}>{catalogUnavailableHint}</p>
      ) : null}

      {lines.map((line, index) => {
        const ageOptions = allowedAgeBands(line.productType);
        const brandOptions = allowedBrands(line.productType, line.ageBand);
        const sizeOptions = allowedSizes(line.productType, line.ageBand);
        const processOptions = allowedProcessesForColor(line.colorId);
        const darkNote = colorRequiresDtfOnly(line.colorId);
        const lineTotal = lineTotalPieces(line);
        const stockedColors = cat ? catalogColorIdsInStock(cat, line) : null;
        const colorChoices =
          stockedColors && stockedColors.length > 0
            ? APPAREL_COLORS.filter(
                (c) => stockedColors.includes(c.id) || c.id === line.colorId,
              )
            : APPAREL_COLORS;

        const hasPricedVariant =
          !!cat && findFirstCatalogVariantForLine(cat, line) !== null;
        const priceFieldValue = !cat
          ? "…"
          : hasPricedVariant
            ? line.unitPrice
            : "—";

        const priceLabel =
          uiVariant === "conta"
            ? "Preço unit. (AOA) — por peça"
            : isLight
              ? "Preço unit. (Kz) — por peça"
              : "Preço unit. (AOA) — por peça";

        return (
          <div key={line.id} className={t.lineCard}>
            <div className="flex items-center justify-between gap-2">
              <span className={t.lineMeta}>
                Artigo {index + 1}
                {lineTotal > 0 ? (
                  <span className={`ml-2 ${t.lineAccent}`}>
                    · {lineTotal}{" "}
                    {lineTotal === 1 ? "peça" : "peças"}
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

            <div className={t.lineGrid}>
              <div>
                <label htmlFor={`tipo-${line.id}`} className={t.label}>
                  Tipo
                </label>
                <select
                  id={`tipo-${line.id}`}
                  value={line.productType}
                  onChange={(e) =>
                    patchLine(line.id, {
                      productType: e.target.value as ApparelProductType,
                    })
                  }
                  className={t.input}
                >
                  {APPAREL_PRODUCT_TYPES.map((ty) => (
                    <option key={ty.id} value={ty.id}>
                      {ty.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`faixa-${line.id}`} className={t.label}>
                  Faixa etária
                </label>
                <select
                  id={`faixa-${line.id}`}
                  value={line.ageBand}
                  disabled={
                    line.productType === "COLETE" ||
                    line.productType === "BONE"
                  }
                  onChange={(e) =>
                    patchLine(line.id, {
                      ageBand: e.target.value as ApparelAgeBand,
                    })
                  }
                  className={t.input}
                >
                  {ageOptions.map((ab) => (
                    <option key={ab} value={ab}>
                      {ab === "ADULT" ? "Adulto" : "Infantil"}
                    </option>
                  ))}
                </select>
                {line.productType === "COLETE" ||
                line.productType === "BONE" ? (
                  <p className={t.helpZinc}>
                    {line.productType === "COLETE"
                      ? "Colete só em tamanhos de adulto."
                      : "Boné: apenas tamanho único (adulto)."}
                  </p>
                ) : null}
              </div>
            </div>

            <div className={t.lineGrid}>
              <div>
                <label htmlFor={`marca-${line.id}`} className={t.label}>
                  Modelo / grade
                </label>
                <select
                  id={`marca-${line.id}`}
                  value={line.brandId}
                  onChange={(e) =>
                    patchLine(line.id, {
                      brandId: e.target.value as ApparelBrandId,
                    })
                  }
                  className={t.input}
                >
                  {brandOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`p-${line.id}`} className={t.label}>
                  {priceLabel}
                </label>
                <input
                  id={`p-${line.id}`}
                  type="text"
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  value={priceFieldValue}
                  className={t.inputReadonly}
                />
              </div>
            </div>

            <div className={t.lineGrid}>
              <div>
                <label htmlFor={`cor-${line.id}`} className={t.label}>
                  <span className={t.badge}>1</span>
                  Cor
                </label>
                <select
                  id={`cor-${line.id}`}
                  value={line.colorId}
                  onChange={(e) =>
                    patchLine(line.id, {
                      colorId: e.target.value as ApparelColorId,
                    })
                  }
                  className={t.input}
                >
                  {colorChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {uiVariant === "conta" ? (
                  <div
                    className="mt-2 flex flex-wrap gap-1.5"
                    role="radiogroup"
                    aria-label="Escolher cor"
                  >
                    {colorChoices.map((c) => {
                      const selected = line.colorId === c.id;
                      const hex = APPAREL_COLOR_PREVIEW_HEX[c.id];
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          title={c.label}
                          onClick={() =>
                            patchLine(line.id, {
                              colorId: c.id,
                              productionProcess:
                                normalizeProductionProcessForColor(
                                  c.id,
                                  line.productionProcess,
                                ),
                            })
                          }
                          className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-zinc-950 transition ${
                            selected
                              ? "scale-110 ring-amber-400"
                              : "ring-transparent hover:ring-zinc-600"
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div>
                <label htmlFor={`proc-${line.id}`} className={t.label}>
                  Processo
                </label>
                <select
                  id={`proc-${line.id}`}
                  value={line.productionProcess}
                  onChange={(e) =>
                    patchLine(line.id, {
                      productionProcess: e.target
                        .value as ProductionProcess,
                    })
                  }
                  className={t.input}
                >
                  {processOptions.includes("SUBLIMATION") ? (
                    <option value="SUBLIMATION">Sublimação</option>
                  ) : null}
                  <option value="DTF">DTF</option>
                </select>
                {darkNote ? <p className={t.dtfNote}>Cores escuras: apenas DTF.</p> : null}
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <span className={`${t.label} mb-0`}>
                  <span className={t.badge}>2</span>
                  Tamanhos
                </span>
                <span className={t.sizeHint}>
                  Só podes pedir combinações activas no catálogo para esta cor.
                  Riscado = indisponível.
                </span>
              </div>
              <div className={t.sizeGridWrap}>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(sizeOptions.length, 1)}, minmax(3.25rem, 1fr))`,
                  }}
                >
                  {sizeOptions.map((size) => {
                    const variantInCatalog =
                      cat &&
                      findCatalogVariantForSelection(cat, {
                        productType: line.productType,
                        ageBand: line.ageBand,
                        brandId: line.brandId,
                        size,
                        colorId: line.colorId,
                        productionProcess: normalizeProductionProcessForColor(
                          line.colorId,
                          line.productionProcess,
                        ),
                      });
                    const blockedByCatalog = cat && !variantInCatalog;
                    const rawQty = line.sizeQuantities[size] ?? "";
                    const qtyNum =
                      parseInt(String(rawQty).replace(/\D/g, ""), 10) || 0;
                    const hasQty = qtyNum > 0 && !blockedByCatalog;
                    return (
                      <div key={size} className="min-w-0">
                        <label
                          htmlFor={`sq-${line.id}-${size}`}
                          className={`mb-1 block text-center text-[10px] font-semibold uppercase tracking-wide ${
                            blockedByCatalog
                              ? t.sizeLabelBlock
                              : t.sizeLabelAvail
                          }`}
                        >
                          {size}
                        </label>
                        <input
                          id={`sq-${line.id}-${size}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0"
                          disabled={!!blockedByCatalog}
                          title={
                            blockedByCatalog
                              ? "Indisponível no catálogo para esta cor, processo e marca."
                              : undefined
                          }
                          value={rawQty}
                          onChange={(e) =>
                            patchSizeQty(line.id, size, e.target.value)
                          }
                          className={`${t.qty} ${
                            blockedByCatalog
                              ? "cursor-not-allowed opacity-35"
                              : ""
                          } ${hasQty ? t.qtySelected : ""}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {uiVariant === "conta" && apparelLineSummaryLabel(line) ? (
              <p className={t.lineSummary}>{apparelLineSummaryLabel(line)}</p>
            ) : null}
          </div>
        );
      })}

      {grandTotalPieces > 0 ? (
        <p className={t.footer}>
          Total no pedido:{" "}
          <span className={t.footerStrong}>
            {grandTotalPieces}{" "}
            {grandTotalPieces === 1 ? "peça" : "peças"}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export const PedidoArtigosEditor = memo(PedidoArtigosEditorInner);
