"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
      <h1 className="text-xl font-bold">Algo correu mal</h1>
      <p className="mt-2 max-w-md text-sm text-zinc-400">
        Ocorreu um erro inesperado. Pode tentar novamente ou voltar à página
        inicial.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200"
        >
          Página inicial
        </Link>
      </div>
    </div>
  );
}
