"use client";

import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { PedidoAreaArtigosEditor } from "@/components/pedidos/PedidoAreaArtigosEditor";
import { PedidoArtigosEditor } from "@/components/pedidos/PedidoArtigosEditor";
import { PedidoGenericArtigosEditor } from "@/components/pedidos/PedidoGenericArtigosEditor";
import type { CatalogProduct } from "@/lib/api-client";
import {
  balcaoPdvCard,
  balcaoPdvTabActive,
  balcaoPdvTabIdle,
  readStoredArtigosTab,
  storeArtigosTab,
  type BalcaoArtigosTabId,
} from "@/lib/balcao-pdv-ui";
import type { AreaLineForm } from "@/lib/area-pricing-catalog";
import type { GenericLineForm } from "@/lib/pedido-generic-lines";
import type { LineForm } from "@/lib/pedido-artigos-lines";

type TabDef = {
  id: BalcaoArtigosTabId;
  label: string;
  badge?: number;
};

type Props = {
  catalog: CatalogProduct[] | null;
  catalogUnavailableHint?: string | null;
  vestuario: {
    lines: LineForm[];
    catalogSyncActive: boolean;
    grandTotalPieces: number;
    addLine: () => void;
    removeLine: (id: string) => void;
    patchLine: (id: string, patch: Partial<LineForm>) => void;
    patchSizeQty: (lineId: string, size: string, raw: string) => void;
  };
  plano: {
    lines: GenericLineForm[];
    genericSyncActive: boolean;
    grandTotalPieces: number;
    addLine: () => void;
    removeLine: (id: string) => void;
    patchLine: (id: string, patch: Partial<GenericLineForm>) => void;
    patchQty: (lineId: string, raw: string) => void;
  };
  lona: {
    lines: AreaLineForm[];
    areaSyncActive: boolean;
    activeLineCount: number;
    addLine: () => void;
    removeLine: (id: string) => void;
    patchLine: (id: string, patch: Partial<AreaLineForm>) => void;
    patchDimension: (lineId: string, field: "widthM" | "heightM", raw: string) => void;
    patchQty: (lineId: string, raw: string) => void;
  };
  stockSlot: ReactNode;
  insumoLineCount: number;
};

function BalcaoArtigosTabsInner({
  catalog,
  catalogUnavailableHint,
  vestuario,
  plano,
  lona,
  stockSlot,
  insumoLineCount,
}: Props) {
  const [tab, setTab] = useState<BalcaoArtigosTabId>(() => readStoredArtigosTab());

  useEffect(() => {
    storeArtigosTab(tab);
  }, [tab]);

  const tabs: TabDef[] = [
    {
      id: "vestuario",
      label: "Vestuário",
      badge: vestuario.grandTotalPieces || undefined,
    },
    {
      id: "plano",
      label: "Plano / Caneca",
      badge: plano.grandTotalPieces || undefined,
    },
    {
      id: "lona",
      label: "Lona / Vinil",
      badge: lona.activeLineCount || undefined,
    },
    {
      id: "stock",
      label: "Stock",
      badge: insumoLineCount || undefined,
    },
  ];

  const onTab = useCallback((id: BalcaoArtigosTabId) => setTab(id), []);

  return (
    <section className={`${balcaoPdvCard} space-y-3`}>
      <div>
        <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
          Artigos
        </h2>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Escolhe a categoria e adiciona linhas. Só a tab activa fica aberta.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Tipo de artigo"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
              tab === t.id ? balcaoPdvTabActive : balcaoPdvTabIdle
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 ? (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {catalogUnavailableHint ? (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-1.5 text-xs text-zinc-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {catalogUnavailableHint}
        </p>
      ) : null}

      <div role="tabpanel" className="min-h-[8rem]">
        {tab === "vestuario" ? (
          <PedidoArtigosEditor
            catalog={catalog}
            catalogSyncActive={vestuario.catalogSyncActive}
            lines={vestuario.lines}
            grandTotalPieces={vestuario.grandTotalPieces}
            addLine={vestuario.addLine}
            removeLine={vestuario.removeLine}
            patchLine={vestuario.patchLine}
            patchSizeQty={vestuario.patchSizeQty}
            uiVariant="pdvCompact"
            embedded
            addLineButtonLabel="+ Peça"
          />
        ) : null}
        {tab === "plano" ? (
          <PedidoGenericArtigosEditor
            catalog={catalog}
            genericSyncActive={plano.genericSyncActive}
            lines={plano.lines}
            grandTotalPieces={plano.grandTotalPieces}
            addLine={plano.addLine}
            removeLine={plano.removeLine}
            patchLine={plano.patchLine}
            patchQty={plano.patchQty}
            uiVariant="pdvCompact"
            embedded
            sectionTitle="Canecas e impressão plana"
            addLineButtonLabel="+ Artigo"
          />
        ) : null}
        {tab === "lona" ? (
          <PedidoAreaArtigosEditor
            catalog={catalog}
            areaSyncActive={lona.areaSyncActive}
            lines={lona.lines}
            activeLineCount={lona.activeLineCount}
            addLine={lona.addLine}
            removeLine={lona.removeLine}
            patchLine={lona.patchLine}
            patchDimension={lona.patchDimension}
            patchQty={lona.patchQty}
            uiVariant="pdvCompact"
            embedded
          />
        ) : null}
        {tab === "stock" ? stockSlot : null}
      </div>
    </section>
  );
}

export const BalcaoArtigosTabs = memo(BalcaoArtigosTabsInner);
