"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKb,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { runOverlayEnter, runOverlayExitThen } from "@/lib/anime-ui";

export type AnimatedConfirmOptions = {
  title?: string;
  message: string;
  /** Linha extra, mais discreta (destino, custo, aviso). */
  hint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = AnimatedConfirmOptions & {
  resolve: (value: boolean) => void;
};

type AnimatedConfirmContextValue = {
  confirmAction: (opts: AnimatedConfirmOptions) => Promise<boolean>;
};

const AnimatedConfirmContext = createContext<AnimatedConfirmContextValue | null>(
  null,
);

export function useAnimatedConfirm(): AnimatedConfirmContextValue["confirmAction"] {
  const ctx = useContext(AnimatedConfirmContext);
  if (!ctx) {
    throw new Error(
      "useAnimatedConfirm deve ser usado dentro de AnimatedConfirmProvider.",
    );
  }
  return ctx.confirmAction;
}

function ConfirmLayer({
  pending,
  onDismiss,
}: {
  pending: Pending;
  onDismiss: (ok: boolean) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const enterCleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const bd = backdropRef.current;
    const pn = panelRef.current;
    if (!bd || !pn) return;
    enterCleanupRef.current?.();
    enterCleanupRef.current = runOverlayEnter(bd, pn);
    return () => {
      enterCleanupRef.current?.();
      enterCleanupRef.current = null;
    };
  }, [pending]);

  const close = useCallback(
    (ok: boolean) => {
      const bd = backdropRef.current;
      const pn = panelRef.current;
      enterCleanupRef.current?.();
      enterCleanupRef.current = null;
      if (!bd || !pn) {
        onDismiss(ok);
        return;
      }
      runOverlayExitThen(bd, pn, () => onDismiss(ok));
    },
    [onDismiss],
  );

  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") closeRef.current(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const destructive = pending.destructive ?? false;
  const confirmLabel = pending.confirmLabel ?? "Confirmar";
  const cancelLabel = pending.cancelLabel ?? "Cancelar";

  function onBackdropKeyDown(e: ReactKb<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") close(false);
  }

  return (
    <div className="fixed inset-0 z-[200]" role="presentation">
      <div
        ref={backdropRef}
        role="button"
        tabIndex={-1}
        aria-label="Fechar diálogo"
        className="absolute inset-0 cursor-default bg-black/55 dark:bg-black/70"
        onClick={() => close(false)}
        onKeyDown={onBackdropKeyDown}
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="animated-confirm-title"
        className="relative z-10 w-full max-w-[26rem] cursor-default overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] pointer-events-auto"
      >
        <div
          className={`h-1 ${destructive ? "bg-red-500" : "bg-gradient-to-r from-amber-400 to-orange-500"}`}
        />
        <div className="p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400/85">
          Confirmação
        </p>
        <h2
          id="animated-confirm-title"
          className="mt-1 text-lg font-bold tracking-tight text-white"
        >
          {pending.title ?? "Confirmar acção"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {pending.message}
        </p>
        {pending.hint ? (
          <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-300">
            {pending.hint}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={
              destructive
                ? "rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-400"
                : "rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-bold text-zinc-950 shadow-sm shadow-amber-500/20 transition hover:brightness-105"
            }
          >
            {confirmLabel}
          </button>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export function AnimatedConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal só no cliente (evita mismatch de hidratação).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount para createPortal em document.body
    setMounted(true);
  }, []);

  const confirmAction = useCallback((opts: AnimatedConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleDismiss = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(ok);
      return null;
    });
  }, []);

  return (
    <AnimatedConfirmContext.Provider value={{ confirmAction }}>
      {children}
      {mounted && pending
        ? createPortal(
            <ConfirmLayer pending={pending} onDismiss={handleDismiss} />,
            document.body,
          )
        : null}
    </AnimatedConfirmContext.Provider>
  );
}
