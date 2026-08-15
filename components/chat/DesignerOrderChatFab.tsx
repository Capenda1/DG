"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSession } from "@/lib/auth-session";
import {
  adminListOrders,
  getUnreadCounts,
  type OrderListItem,
} from "@/lib/api-client";
import { FLOATING_ABOVE_BOTTOM_BAR } from "@/lib/app-bottom-bar";
import { DESIGNER_CHAT_OPEN_EVENT } from "@/lib/designer-chat-events";
import { orderStatusLabel } from "@/lib/order-status";
import { ChatBox } from "./ChatBox";

const POLL_MS = 8000;
const ORDERS_TAKE = 100;

function statusDot(status: string) {
  const map: Record<string, string> = {
    DRAFT: "bg-zinc-500",
    SUBMITTED: "bg-blue-400",
    VALIDATION_PAYMENT: "bg-violet-400",
    APPROVED: "bg-teal-400",
    IN_PRODUCTION: "bg-orange-400",
    FINISHED: "bg-amber-400",
    DELIVERED: "bg-emerald-600",
    CANCELLED: "bg-red-500",
  };
  return map[status] ?? "bg-zinc-600";
}

/**
 * FAB + painel para o perfil DESIGNER falarem sobre um pedido (mesmo fio que o cliente e a operações na área cliente).
 */
export function DesignerOrderChatFab() {
  const [open, setOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [appeared, setAppeared] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const session = loadSession();
  const currentUserId = session?.user?.id ?? "";

  useEffect(() => {
    const t = setTimeout(() => setAppeared(true), 400);
    return () => clearTimeout(t);
  }, []);

  const fetchOrders = useCallback(async () => {
    if (loadingOrders) return;
    setLoadingOrders(true);
    try {
      const data = await adminListOrders(ORDERS_TAKE, 0);
      setOrders(data);
    } catch {
      /* silencioso */
    } finally {
      setLoadingOrders(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    function onOpenChat(e: Event) {
      const ce = e as CustomEvent<{ orderId?: string }>;
      const id = ce.detail?.orderId?.trim();
      if (!id) return;
      setActiveOrderId(id);
      setOpen(true);
    }
    window.addEventListener(DESIGNER_CHAT_OPEN_EVENT, onOpenChat);
    return () =>
      window.removeEventListener(DESIGNER_CHAT_OPEN_EVENT, onOpenChat);
  }, []);

  const fetchUnread = useCallback(async () => {
    if (orders.length === 0) return;
    try {
      const map = await getUnreadCounts(orders.map((o) => o.id));
      setUnreadMap(map);
    } catch {
      /* silencioso */
    }
  }, [orders]);

  useEffect(() => {
    void fetchUnread();
    const id = setInterval(() => void fetchUnread(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchUnread]);

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (open && activeOrderId) {
      setUnreadMap((m) => ({ ...m, [activeOrderId]: 0 }));
    }
  }, [open, activeOrderId]);

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  useEffect(() => {
    if (open) void fetchOrders();
  }, [open, fetchOrders]);

  return (
    <>
      <div
        className={`fixed left-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out origin-bottom-left ${
          open
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ bottom: `calc(${FLOATING_ABOVE_BOTTOM_BAR} + 2.75rem)` }}
      >
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-500/20 via-transparent to-transparent blur-sm" />

        <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-black/70 ring-1 ring-white/[0.06]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-zinc-400 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
            aria-label="Fechar chat"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>

          {activeOrderId ? (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setActiveOrderId(null)}
                className="flex items-center gap-1.5 border-b border-zinc-800/60 bg-zinc-950 px-4 py-2.5 text-[11px] font-medium text-zinc-500 transition hover:text-amber-400"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M8 1L3 6l5 5" />
                </svg>
                Outro pedido
              </button>
              <ChatBox
                orderId={activeOrderId}
                currentUserId={currentUserId}
                peerLabel={
                  activeOrder
                    ? `Cliente · ${activeOrder.orderNumber}`
                    : "Conversa do pedido"
                }
                orderNumber={activeOrder?.orderNumber}
                maxH="340px"
              />
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden rounded-2xl bg-[#0a0a0a]">
              <div className="relative overflow-hidden px-5 py-4 pr-11">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-950/30 via-zinc-900/60 to-zinc-900/80" />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30">
                    <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-none">Dúvidas no pedido</p>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                      Selecciona um pedido da sua lista para conversar com o cliente ou a equipa sobre o trabalho.
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-[340px] overflow-y-auto divide-y divide-zinc-800/40">
                {loadingOrders && orders.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-800 border-t-amber-400" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                    <p className="text-sm text-zinc-500">Ainda não há pedidos nesta vista.</p>
                    <p className="mt-1 text-[11px] text-zinc-700">
                      Quando existirem pedidos em fila ou atribuídos a si, aparecem aqui para que possa esclarecer dúvidas.
                    </p>
                  </div>
                ) : (
                  orders.map((o) => {
                    const unread = unreadMap[o.id] ?? 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setActiveOrderId(o.id)}
                        className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-900/60"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 ring-1 ring-white/5">
                          <span className={`h-2 w-2 rounded-full ${statusDot(o.status)}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-amber-300">
                            {o.orderNumber}
                          </p>
                          <p className="mt-0.5 text-[10px] text-zinc-600">{orderStatusLabel(o.status)}</p>
                        </div>

                        {unread > 0 ? (
                          <span className="flex h-5 min-w-5 shrink-0 animate-pulse items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-zinc-950">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : (
                          <svg
                            className="h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-500"
                            fill="none"
                            viewBox="0 0 16 16"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          >
                            <path d="M6 12l4-4-4-4" />
                          </svg>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`fixed left-4 z-[60] transition-all duration-500 ${
          appeared ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
        style={{ bottom: FLOATING_ABOVE_BOTTOM_BAR }}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Fechar conversa — dúvidas" : "Abrir conversa — dúvidas no pedido"}
          className={`group relative flex h-9 w-9 items-center justify-center rounded-lg shadow-md transition-all duration-200 active:scale-95 ${
            open
              ? "bg-zinc-800 shadow-black/50 hover:bg-zinc-700"
              : "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-600/30 hover:from-amber-300 hover:to-amber-500"
          }`}
        >
          <span
            className={`absolute transition-all duration-200 ${
              open ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 rotate-90"
            }`}
          >
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </span>
          <span
            className={`absolute transition-all duration-200 ${
              open ? "scale-0 opacity-0 -rotate-90" : "scale-100 opacity-100 rotate-0"
            }`}
          >
            <svg className="h-4 w-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
            </svg>
          </span>

          {!open && totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-black text-white shadow-md shadow-red-500/40">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}

          <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 text-[11px] font-semibold text-zinc-300 opacity-0 shadow-xl backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {open
              ? "Fechar"
              : totalUnread > 0
                ? `${totalUnread} mensagem${totalUnread > 1 ? "s" : ""} não lida${totalUnread > 1 ? "s" : ""}`
                : "Dúvidas — chat do pedido"}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-800" />
          </span>
        </button>

        {!open && totalUnread > 0 && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg bg-amber-400/25" />
        )}
      </div>
    </>
  );
}
