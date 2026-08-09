import { Suspense } from "react";
import { FacturasModule } from "@/components/admin/FacturasModule";

function FacturasFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-zinc-500">
      A carregar módulo de faturação…
    </div>
  );
}

export default function FacturasPage() {
  return (
    <Suspense fallback={<FacturasFallback />}>
      <FacturasModule />
    </Suspense>
  );
}
