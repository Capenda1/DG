"use client";

import { memo } from "react";
import type { CounterInsumoListItem } from "@/lib/api-client";
import { BalcaoInsumoPicker } from "@/components/admin/balcao/BalcaoInsumoPicker";
import { balcaoPdvCard } from "@/lib/balcao-pdv-ui";
import { formatMoney } from "@/lib/format-money";
import {
  dadivaInput,
  dadivaInputReadonly,
  dadivaLabelCompact,
} from "@/lib/dadiva-ui-classes";
import { sanitizeUnsignedIntString } from "@/lib/numeric-input";

export type BalcaoInsumoRow = {
  id: string;
  insumoId: string;
  qty: string;
};

type Props = {
  rows: BalcaoInsumoRow[];
  insumos: CounterInsumoListItem[];
  insumosErr: string | null;
  currency: string;
  sellingUnit: (it: CounterInsumoListItem | undefined) => number;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onSelectProduct: (rowId: string, insumoId: string) => void;
  onPatchQty: (rowId: string, qty: string) => void;
  embedded?: boolean;
};

function BalcaoInsumosSectionInner({
  rows,
  insumos,
  insumosErr,
  currency,
  sellingUnit,
  onAddRow,
  onRemoveRow,
  onSelectProduct,
  onPatchQty,
  embedded = false,
}: Props) {
  const body = (
    <>
      {insumosErr ? (
        <p
          className="rounded-lg border border-red-300/70 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {insumosErr}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
          Opcional — tintas, consumíveis e retalho de stock.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row, idx) => {
            const insumoSel = row.insumoId
              ? insumos.find((i) => i.id === row.insumoId)
              : undefined;
            const unitFromProduct = sellingUnit(insumoSel);
            const unitLabel =
              !row.insumoId
                ? "—"
                : Number.isFinite(unitFromProduct) && unitFromProduct > 0
                  ? formatMoney(unitFromProduct, currency)
                  : "Sem preço";

            return (
              <li
                key={row.id}
                className="rounded-lg border border-zinc-200/90 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800/60"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase text-zinc-500">
                    Linha {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.id)}
                    className="text-[10px] font-bold text-red-700 dark:text-red-400"
                  >
                    Remover
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-6">
                    <label
                      className={dadivaLabelCompact}
                      htmlFor={`balcao-insumo-${row.id}`}
                    >
                      Produto
                    </label>
                    <BalcaoInsumoPicker
                      id={`balcao-insumo-${row.id}`}
                      value={row.insumoId}
                      onChange={(id) => onSelectProduct(row.id, id)}
                      rows={insumos}
                      disabled={insumos.length === 0}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={dadivaLabelCompact}>Qtd</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.qty}
                      onChange={(e) =>
                        onPatchQty(
                          row.id,
                          sanitizeUnsignedIntString(e.target.value),
                        )
                      }
                      className={`${dadivaInput} mt-1 !py-2`}
                      placeholder="0"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={dadivaLabelCompact}>Preço un.</label>
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={unitLabel}
                      className={`${dadivaInputReadonly} ${dadivaInput} mt-1 !py-2`}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddRow}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            + Linha de material
          </button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section className={`${balcaoPdvCard} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
            Materiais e insumos
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Retalho de stock — baixa automática ao pagar.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="rounded-lg border border-violet-400/55 bg-white px-3 py-1.5 text-[11px] font-bold text-violet-900 dark:bg-zinc-800 dark:text-violet-200"
        >
          + Linha
        </button>
      </div>
      {body}
    </section>
  );
}

export const BalcaoInsumosSection = memo(BalcaoInsumosSectionInner);
