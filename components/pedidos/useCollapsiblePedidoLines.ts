"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Mantém só uma linha expandida. Ao adicionar uma nova, a anterior
 * fica minimizada para libertar espaço no PDV de balcão.
 */
export function useCollapsiblePedidoLines(
  lineIds: readonly string[],
  enabled: boolean,
) {
  const idsKey = lineIds.join("|");
  const [expandedId, setExpandedId] = useState<string | null>(
    () => lineIds[lineIds.length - 1] ?? null,
  );
  const prevLenRef = useRef(lineIds.length);

  useEffect(() => {
    if (!enabled) return;
    const ids = idsKey ? idsKey.split("|") : [];
    let nextExpandedId: string | null | undefined;

    if (ids.length === 0) {
      nextExpandedId = null;
      prevLenRef.current = 0;
    } else {
      const newest = ids[ids.length - 1]!;
      if (
        ids.length > prevLenRef.current ||
        !expandedId ||
        !ids.includes(expandedId)
      ) {
        nextExpandedId = newest;
      }
      prevLenRef.current = ids.length;
    }

    if (nextExpandedId === undefined || nextExpandedId === expandedId) return;

    /*
     * A lista é uma entrada externa do hook. Agenda a reconciliação para não
     * provocar uma actualização síncrona em cascata dentro do effect.
     */
    const timeout = window.setTimeout(() => {
      setExpandedId(nextExpandedId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [enabled, idsKey, expandedId]);

  const isExpanded = useCallback(
    (id: string) => {
      if (!enabled || lineIds.length <= 1) return true;
      return expandedId === id;
    },
    [enabled, expandedId, lineIds.length],
  );

  const expand = useCallback((id: string) => {
    setExpandedId(id);
  }, []);

  return {
    isExpanded,
    expand,
    collapseActive: enabled && lineIds.length > 1,
  };
}
