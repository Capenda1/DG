"use client";



import type { CatalogProduct } from "@/lib/api-client";

import {

  applyLineConstraints,

  type LineForm,

  newLine,

} from "@/lib/pedido-artigos-lines";

import {

  filterGenericCatalogProducts,

  genericLineWithSyncedPrice,

  newGenericLine,

  type GenericLineForm,

  variantsForProduct,

} from "@/lib/pedido-generic-lines";

import { sanitizeUnsignedIntString } from "@/lib/numeric-input";

import { useCallback, useMemo, useState } from "react";



export function usePedidoGenericArtigos(catalog: CatalogProduct[] | null) {

  const [rawLines, setRawLines] = useState<GenericLineForm[]>(() => [

    newGenericLine(catalog),

  ]);



  const genericProducts = useMemo(

    () => filterGenericCatalogProducts(catalog),

    [catalog],

  );



  const genericSyncActive = genericProducts.some((p) => p.variants.length > 0);



  const lines = useMemo(() => {

    if (!genericSyncActive || !catalog?.length) return rawLines;

    return rawLines.map((l) => genericLineWithSyncedPrice(l, catalog));

  }, [rawLines, catalog, genericSyncActive]);



  const grandTotalPieces = useMemo(

    () =>

      lines.reduce((acc, l) => {

        const n = parseInt(l.quantity.trim(), 10);

        return acc + (Number.isFinite(n) && n > 0 ? n : 0);

      }, 0),

    [lines],

  );



  const addLine = useCallback(() => {

    setRawLines((prev) => {

      const n = newGenericLine(catalog);

      const withPrice =

        genericSyncActive && catalog?.length

          ? genericLineWithSyncedPrice(n, catalog)

          : n;

      return [...prev, withPrice];

    });

  }, [catalog, genericSyncActive]);



  const removeLine = useCallback((id: string) => {

    setRawLines((prev) =>

      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id),

    );

  }, []);



  const patchLine = useCallback(

    (id: string, patch: Partial<GenericLineForm>) => {

      setRawLines((prev) =>

        prev.map((l) => {

          if (l.id !== id) return l;

          let next = { ...l, ...patch };

          if (patch.productId && patch.productId !== l.productId && catalog) {

            const vars = variantsForProduct(catalog, patch.productId);

            const first = vars[0];

            next = {

              ...next,

              variantId: first?.id ?? "",

            };

          }

          if (catalog?.length) {

            next = genericLineWithSyncedPrice(next, catalog);

          }

          return next;

        }),

      );

    },

    [catalog],

  );



  const patchQty = useCallback((lineId: string, raw: string) => {

    const cleaned = sanitizeUnsignedIntString(raw);

    setRawLines((prev) =>

      prev.map((l) => (l.id === lineId ? { ...l, quantity: cleaned } : l)),

    );

  }, []);



  const resetLines = useCallback(() => {

    setRawLines([newGenericLine(catalog)]);

  }, [catalog]);



  const setLines = useCallback(

    (

      next:

        | GenericLineForm[]

        | ((prev: GenericLineForm[]) => GenericLineForm[]),

    ) => {

      setRawLines(next);

    },

    [],

  );



  return {

    lines,

    genericProducts,

    genericSyncActive,

    grandTotalPieces,

    addLine,

    removeLine,

    patchLine,

    patchQty,

    resetLines,

    setLines,

  };

}



/** Re-export apparel hook types for combined pages — no change needed here. */

export type { LineForm };



export { newLine, applyLineConstraints };


