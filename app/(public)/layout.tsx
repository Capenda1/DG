import type { ReactNode } from "react";

/** Segmento público: página inicial e login (sem autenticação obrigatória nestas rotas). */
export default function PublicRoutesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
