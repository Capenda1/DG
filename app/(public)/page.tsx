"use client";

import { useEffect } from "react";
import { clearSession, loadSession } from "@/lib/auth-session";
import { dadivaScreenWaiting } from "@/lib/dadiva-ui-classes";
import { hardNavigateReplace, postLoginPath, ROUTES } from "@/lib/routes";

export default function HomePage() {
  useEffect(() => {
    const s = loadSession();
    if (!s?.user) {
      hardNavigateReplace(ROUTES.login);
      return;
    }
    const next = postLoginPath(s.user.role);
    if (next === ROUTES.login) {
      clearSession();
      hardNavigateReplace(ROUTES.login);
      return;
    }
    /* Igual ao pós-login: navegação completa evita estados estranhos do App Router com área admin. */
    window.location.assign(next);
  }, []);

  return (
    <div className={dadivaScreenWaiting}>A redirecionar…</div>
  );
}
