/** Estilos partilhados — PDV compacto (menos gradientes, mais rapidez visual). */
export const balcaoPdvCard =
  "rounded-xl border border-zinc-200/90 bg-white p-3.5 shadow-sm dark:border-zinc-600 dark:bg-zinc-900";

export const balcaoPdvTabActive =
  "border-amber-500/60 bg-amber-50 text-zinc-900 ring-1 ring-amber-400/40 dark:border-amber-500/45 dark:bg-amber-950/40 dark:text-amber-50";

export const balcaoPdvTabIdle =
  "border-zinc-200/90 bg-white text-zinc-600 hover:border-amber-400/40 hover:bg-amber-50/50 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800";

export type BalcaoArtigosTabId = "vestuario" | "plano" | "lona" | "stock";

export const BALCAO_ARTIGOS_TAB_KEY = "dadiva.balcao.artigosTab";

export function readStoredArtigosTab(): BalcaoArtigosTabId {
  if (typeof window === "undefined") return "vestuario";
  try {
    const v = localStorage.getItem(BALCAO_ARTIGOS_TAB_KEY);
    if (v === "plano" || v === "lona" || v === "stock" || v === "vestuario") {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "vestuario";
}

export function storeArtigosTab(tab: BalcaoArtigosTabId): void {
  try {
    localStorage.setItem(BALCAO_ARTIGOS_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}
