"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Link de saída da área de modelagem (sem diálogo de confirmação). */
export function ModelagemExitLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
