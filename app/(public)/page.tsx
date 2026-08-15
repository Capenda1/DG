import { Suspense } from "react";
import LoginPage from "./login/page";

export default function PublicHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-black">
          A carregar…
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
