"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type Props = {
  className?: string;
  /** Variante compacta para barras densas */
  size?: "default" | "sm";
};

/**
 * Alterna entre tema claro e escuro (persiste em localStorage via next-themes).
 */
export function ThemeToggle({ className = "", size = "default" }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratação: ícones/rótulos alinhados com next-themes
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const pad = size === "sm" ? "p-1.5" : "p-2";
  const iconClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  /** Rótulos que dependem do tema só após hidratar — senão servidor vs cliente divergem. */
  const a11yWhenMounted: { label: string; tip: string } | null = mounted
    ? isDark
      ? { label: "Activar modo claro", tip: "Modo claro" }
      : { label: "Activar modo escuro", tip: "Modo escuro" }
    : null;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white/95 text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-white/15 dark:bg-zinc-900/90 dark:text-amber-200/95 dark:hover:bg-zinc-800 ${pad} ${className}`}
      aria-label={
        a11yWhenMounted?.label ??
        "Alternar entre modo claro e modo escuro do site"
      }
      title={a11yWhenMounted?.tip ?? "Alternar tema"}
    >
      {!mounted ? (
        <span className={`block ${iconClass}`} aria-hidden />
      ) : isDark ? (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
