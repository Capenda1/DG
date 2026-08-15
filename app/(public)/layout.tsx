import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Área do Cliente — Dádiva Go",
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
};

/** Segmento público: página inicial e login (sem autenticação obrigatória nestas rotas). */
export default function PublicRoutesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
