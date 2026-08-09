"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt">
      <body className="flex min-h-svh flex-col items-center justify-center bg-black px-6 text-center text-white">
        <h1 className="text-xl font-bold">Erro crítico</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          A aplicação encontrou um problema grave. Recarregue a página ou
          contacte o administrador.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black"
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
