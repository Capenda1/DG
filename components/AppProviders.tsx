"use client";

import { AnimatedConfirmProvider } from "@/components/providers/AnimatedConfirmProvider";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="dadivago-theme"
      disableTransitionOnChange
    >
    <AnimatedConfirmProvider>{children}</AnimatedConfirmProvider>
    </ThemeProvider>
  );
}
