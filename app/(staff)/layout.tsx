import type { ReactNode } from "react";

/**
 * Equipa interna (Admin, Atendente, Designer) — mesma árvore `/admin/...`;
 * o `AdminAppShell` e a API restringem por papel.
 */
export default function StaffRoutesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
