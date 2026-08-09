"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientGallerySlideshow } from "@/components/client/ClientGallerySlideshow";
import { listOrders, type OrderListItem } from "@/lib/api-client";
import { loadSession, type AuthSession } from "@/lib/auth-session";
import { ROUTES } from "@/lib/routes";

function groupByStatus(orders: OrderListItem[]) {
  const active = orders.filter(
    (o) => !["DELIVERED", "CANCELLED", "DRAFT"].includes(o.status),
  ).length;
  const draft = orders.filter((o) => o.status === "DRAFT").length;
  const done = orders.filter((o) => o.status === "DELIVERED").length;
  return { active, draft, done, total: orders.length };
}

export default function ContaHomePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listOrders(50);
      setOrders(rows);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSession(loadSession());
  }, []);
  useEffect(() => {
    if (!loadSession()?.user) {
      setLoading(false);
      return;
    }
    void load();
  }, [load]);

  const stats = groupByStatus(orders);
  const firstName = session?.user.name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-2">
      <section className="relative overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-br from-white via-white to-amber-50/50 px-4 py-4 shadow-[0_16px_40px_-24px_rgba(245,158,11,0.2)] dark:border-white/[0.07] dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-[0_20px_48px_-28px_rgba(0,0,0,0.5)] sm:px-6 sm:py-5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-violet-500 opacity-95"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-400/15 blur-2xl dark:bg-amber-400/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-violet-500/10 blur-xl dark:bg-violet-500/8" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/90 dark:text-amber-400/85">
              Área do cliente
            </p>
            <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              {firstName ? `Olá, ${firstName}` : "Bem-vindo"}
            </h1>
            <p className="mt-1.5 max-w-md text-[12px] leading-snug text-zinc-600 dark:text-zinc-400 sm:text-[13px]">
              Acompanhe os seus pedidos e trabalhe com a equipa na modelagem das
              suas peças.
            </p>
            {!loading && orders.length > 0 ? (
              <p className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-500">
                <span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-300">
                    {stats.total}
                  </span>{" "}
                  pedidos
                </span>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span>
                  <span className="font-semibold text-amber-800 dark:text-amber-300/90">
                    {stats.active}
                  </span>{" "}
                  em curso
                </span>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-400">
                    {stats.draft}
                  </span>{" "}
                  rascunho{stats.draft !== 1 ? "s" : ""}
                </span>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span>
                  <span className="font-semibold text-emerald-800 dark:text-emerald-400/90">
                    {stats.done}
                  </span>{" "}
                  entregue{stats.done !== 1 ? "s" : ""}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
            <Link
              href={ROUTES.accountPedidoNovo}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2.5 text-[12px] font-bold text-zinc-950 shadow-md shadow-amber-500/25 transition hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-400/30 dark:shadow-amber-900/20 sm:min-w-[9.5rem]"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 16 16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M8 2v12M2 8h12" />
              </svg>
              Novo pedido
            </Link>
            <Link
              href={ROUTES.accountPedidos}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300/80 bg-white/60 px-4 py-2 text-[11px] font-semibold text-zinc-700 transition hover:border-amber-300/60 hover:text-amber-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-amber-400/30 dark:hover:text-amber-300 sm:min-w-[9.5rem]"
            >
              Os meus pedidos
            </Link>
          </div>
        </div>
      </section>

      <ClientGallerySlideshow />
    </div>
  );
}
