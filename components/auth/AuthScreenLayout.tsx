"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LoginBackground } from "@/components/auth/LoginBackground";
import { runLoginReveal } from "@/lib/anime-ui";

function IconSpark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.2 4.9L18 8l-4.8 1.1L12 14l-1.2-4.9L6 8l4.8-1.1L12 2zM19 13l.6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6.6-2.4zM5 15l.8 3.2 3.2.8-3.2.8-.8 3.2-.8-3.2-3.2-.8 3.2-.8.8-3.2z" />
    </svg>
  );
}

type AuthScreenLayoutProps = {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthScreenLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthScreenLayoutProps) {
  const revealRootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = revealRootRef.current;
    if (!root) return undefined;
    return runLoginReveal(root);
  }, []);

  return (
    <div className="login-root relative flex min-h-svh flex-col bg-zinc-100 text-zinc-900 dark:bg-black dark:text-white">
      <LoginBackground />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex min-h-svh flex-1 flex-col items-center justify-center px-4 py-10 sm:items-end sm:py-12 sm:pl-8 sm:pr-12 md:py-14 md:pr-16 lg:pr-24">
        <div className="w-full max-w-lg shrink-0">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200/90 bg-white/90 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] ring-1 ring-zinc-200/50 backdrop-blur-xl dark:border-white/10 dark:bg-black/80 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)] dark:ring-white/5">
            <div ref={revealRootRef}>
              <div
                data-anime-login
                className="h-[3px] w-full bg-gradient-to-r from-amber-500 via-violet-500 to-sky-500 opacity-95 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.45)]"
              />

              <div className="px-7 py-8 sm:px-10 sm:py-10">
                <header data-anime-login className="mb-7 text-left sm:mb-8">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
                    <IconSpark className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    Dádiva Go
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-[1.7rem] dark:text-white">
                    {title}
                  </h1>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {subtitle}
                  </p>
                </header>

                <div data-anime-login>{children}</div>

                {footer ? (
                  <div data-anime-login className="mt-6 border-t border-zinc-200/80 pt-5 dark:border-white/10">
                    {footer}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
