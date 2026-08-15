"use client";

import { useEffect, type RefObject } from "react";

/**
 * Altura da barra de acções fixa no fundo do ecrã, publicada como custom
 * property no `<html>`. Botões flutuantes (chat) usam-na para não cobrir
 * os botões dessas barras.
 */
export const APP_BOTTOM_BAR_VAR = "--app-bottom-bar-h";

/** `bottom` para elementos flutuantes que devem ficar acima da barra. */
export const FLOATING_ABOVE_BOTTOM_BAR = `calc(1rem + var(${APP_BOTTOM_BAR_VAR}, 0px))`;

/** Barras registadas — suporta várias montadas ao mesmo tempo. */
const heights = new Map<Element, number>();

function publish(): void {
  if (typeof document === "undefined") return;
  const tallest = Math.max(0, ...heights.values());
  document.documentElement.style.setProperty(
    APP_BOTTOM_BAR_VAR,
    `${Math.round(tallest)}px`,
  );
}

/**
 * Publica a altura da barra enquanto ela estiver realmente fixa.
 * Barras que passam a `static` em desktop (ex.: `sm:static`) registam 0,
 * porque nesse caso já não sobrepõem nada.
 */
export function useRegisterBottomBar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const fixed = window.getComputedStyle(el).position === "fixed";
      heights.set(el, fixed ? el.offsetHeight : 0);
      publish();
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      heights.delete(el);
      publish();
    };
  }, [ref]);
}
