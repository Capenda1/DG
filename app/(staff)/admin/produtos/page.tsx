import { Suspense } from "react";
import { AdminProductsManager } from "@/components/admin/AdminProductsManager";

function ProdutosFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-zinc-500">
      A carregar produtos…
    </div>
  );
}

export default function AdminProdutosPage() {
  return (
    <Suspense fallback={<ProdutosFallback />}>
      <AdminProductsManager />
    </Suspense>
  );
}
