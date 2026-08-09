"use client";



import type { CatalogProduct } from "@/lib/api-client";

import {

  areaLineWithSyncedVariant,

  filterAreaCatalogProducts,

  newAreaLine,

  syncAreaLineTotals,

  type AreaLineForm,

} from "@/lib/area-pricing-catalog";

import { findVariantInCatalog, variantsForProduct } from "@/lib/pedido-generic-lines";

import { sanitizeUnsignedIntString } from "@/lib/numeric-input";

import { useCallback, useMemo, useState } from "react";



function sanitizeDimension(raw: string): string {

  const cleaned = raw.replace(/[^\d,.]/g, "").replace(",", ".");

  const parts = cleaned.split(".");

  if (parts.length <= 2) return cleaned;

  return `${parts[0]}.${parts.slice(1).join("")}`;

}



export function usePedidoAreaArtigos(catalog: CatalogProduct[] | null) {

  const [rawLines, setRawLines] = useState<AreaLineForm[]>(() => [

    newAreaLine(catalog),

  ]);



  const areaProducts = useMemo(

    () => filterAreaCatalogProducts(catalog),

    [catalog],

  );



  const areaSyncActive = areaProducts.some((p) => p.variants.length > 0);



  const lines = useMemo(() => {

    if (!areaSyncActive || !catalog?.length) return rawLines;

    return rawLines.map((l) => areaLineWithSyncedVariant(l, catalog));

  }, [rawLines, catalog, areaSyncActive]);



  const activeLineCount = useMemo(

    () =>

      lines.filter(

        (l) =>

          l.widthM.trim() &&

          l.heightM.trim() &&

          parseInt(l.quantity.trim(), 10) >= 1,

      ).length,

    [lines],

  );



  const addLine = useCallback(() => {

    setRawLines((prev) => {

      const n = newAreaLine(catalog);

      const synced =

        areaSyncActive && catalog?.length

          ? areaLineWithSyncedVariant(n, catalog)

          : n;

      return [...prev, synced];

    });

  }, [catalog, areaSyncActive]);



  const removeLine = useCallback((id: string) => {

    setRawLines((prev) =>

      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id),

    );

  }, []);



  const patchLine = useCallback(

    (id: string, patch: Partial<AreaLineForm>) => {

      setRawLines((prev) =>

        prev.map((l) => {

          if (l.id !== id) return l;

          let next = { ...l, ...patch };

          if (patch.productId && patch.productId !== l.productId && catalog) {

            const vars = variantsForProduct(catalog, patch.productId);

            next = { ...next, variantId: vars[0]?.id ?? "" };

          }

          if (catalog?.length) {

            next = areaLineWithSyncedVariant(next, catalog);

          } else {

            next = syncAreaLineTotals(next);

          }

          return next;

        }),

      );

    },

    [catalog],

  );



  const patchDimension = useCallback(

    (lineId: string, field: "widthM" | "heightM", raw: string) => {

      const cleaned = sanitizeDimension(raw);

      setRawLines((prev) =>

        prev.map((l) => {

          if (l.id !== lineId) return l;

          const next = syncAreaLineTotals({ ...l, [field]: cleaned });

          return catalog?.length

            ? areaLineWithSyncedVariant(next, catalog)

            : next;

        }),

      );

    },

    [catalog],

  );



  const patchQty = useCallback(

    (lineId: string, raw: string) => {

      const cleaned = sanitizeUnsignedIntString(raw);

      setRawLines((prev) =>

        prev.map((l) => {

          if (l.id !== lineId) return l;

          const next = syncAreaLineTotals({ ...l, quantity: cleaned || "1" });

          return catalog?.length

            ? areaLineWithSyncedVariant(next, catalog)

            : next;

        }),

      );

    },

    [catalog],

  );



  const resetLines = useCallback(() => {

    setRawLines([newAreaLine(catalog)]);

  }, [catalog]);



  return {

    lines,

    areaProducts,

    areaSyncActive,

    activeLineCount,

    addLine,

    removeLine,

    patchLine,

    patchDimension,

    patchQty,

    resetLines,

  };

}


