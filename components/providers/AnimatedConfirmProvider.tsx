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
        className="relative z-10 w-full max-w-md cursor-default rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl pointer-events-auto dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2
          id="animated-confirm-title"
          className="text-lg font-bold text-zinc-900 dark:text-white"
        >
          {pending.title ?? "Confirmação"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {pending.message}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={
              destructive
                ? "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-500"
                : "rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-amber-400"
            }
          >
            {confirmLabel}
          </button>
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
