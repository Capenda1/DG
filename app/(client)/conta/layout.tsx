import type { ReactNode } from "react";
import { Suspense } from "react";
import { ClientAreaShell } from "@/components/client/ClientAreaShell";

function ContaShellFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-black text-sm text-zinc-600">
      A carregar…
    </div>
  );
}

export default function ContaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ContaShellFallback />}>
      <ClientAreaShell>{children}</ClientAreaShell>
    </Suspense>
  );
}
