import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

export const metadata: Metadata = {
  title: "Iniciar sessão — Dádiva Go",
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
};

export default function LoginSegmentLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-black">
          A carregar…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
