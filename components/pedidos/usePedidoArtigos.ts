"use client";

import type { CatalogProduct } from "@/lib/api-client";
import {
  isCatalogSyncActive,
  lineTotalPieces,
  lineWithSyncedUnitPrice,
  type LineForm,
  newLine,
  stripUnavailableCatalogQuantities,
  applyLineConstraints,
} from "@/lib/pedido-artigos-lines";
import { sanitizeUnsignedIntString } from "@/lib/numeric-input";
import { useCallback, useEffect, useMemo, useState } from "react";

export function usePedidoArtigos(catalog: CatalogProduct[] | null) {
  const [lines, setLines] = useState<LineForm[]>(() => [newLine()]);

  const emptyCatalog = !catalog || catalog.length === 0;
  const catalogSyncActive = useMemo(
    () => isCatalogSyncActive(catalog),
    [catalog],
  );

  useEffect(() => {
    if (!catalogSyncActive || emptyCatalog) return;
    const cat = catalog!;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- actualizar linhas com preços do catálogo quando este muda
    setLines((prev) => prev.map((l) => lineWithSyncedUnitPrice(l, cat)));
  }, [catalog, catalogSyncActive, emptyCatalog]);

  const grandTotalPieces = useMemo(
    () => lines.reduce((acc, l) => acc + lineTotalPieces(l), 0),
    [lines],
  );

  const addLine = useCallback(() => {
    setLines((prev) => {
      const n = newLine();
      const withPrice =
        catalogSyncActive && catalog?.length
          ? lineWithSyncedUnitPrice(n, catalog)
          : n;
      return [...prev, withPrice];
    });
  }, [catalog, catalogSyncActive]);

  const removeLine = useCallback((id: string) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.id !== id),
    );
  }, []);

  const patchLine = useCallback(
    (id: string, patch: Partial<LineForm>) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          let next = applyLineConstraints({ ...l, ...patch });
          if (catalogSyncActive && catalog?.length) {
            next = stripUnavailableCatalogQuantities(next, catalog);
            next = lineWithSyncedUnitPrice(next, catalog);
          }
          return next;
        }),
      );
    },
    [catalog, catalogSyncActive],
  );

  const patchSizeQty = useCallback(
    (lineId: string, size: string, raw: string) => {
      const cleaned = sanitizeUnsignedIntString(raw);
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          return {
            ...l,
            sizeQuantities: { ...l.sizeQuantities, [size]: cleaned },
          };
        }),
      );
    },
    [],
  );

  const resetLines = useCallback(() => {
    const n = newLine();
    const withPrice =
      catalogSyncActive && catalog?.length
        ? lineWithSyncedUnitPrice(n, catalog)
        : n;
    setLines([withPrice]);
  }, [catalog, catalogSyncActive]);

  return {
    lines,
    setLines,
    resetLines,
    catalogSyncActive,
    grandTotalPieces,
    addLine,
    removeLine,
    patchLine,
    patchSizeQty,
  };
}
