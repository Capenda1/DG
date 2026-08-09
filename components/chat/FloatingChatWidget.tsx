"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { loadSession } from "@/lib/auth-session";
import {
  getClientCheckoutPaymentSettings,
  getUnreadCounts,
  listOrders,
  type OrderListItem,
} from "@/lib/api-client";
import { orderStatusLabel } from "@/lib/order-status";
import { ChatBox } from "./ChatBox";

const POLL_MS = 8000;

/* ─── Utilitário ───────────────────────────────────────────── */
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

/* ─── Componente principal ─────────────────────────────────── */
export function FloatingChatWidget() {
  const params = useParams();
  const urlOrderId = typeof params?.id === "string" ? params.id : null;

  const [open, setOpen] = useState(false);
  /* orderId activo no chat — pode vir da URL ou do selector */
  const [activeOrderId, setActiveOrderId] = useState<string | null>(urlOrderId);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [waNumber, setWaNumber] = useState<string | undefined>(undefined);
  const [appeared, setAppeared] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const prevTotalRef = useRef(0);

  const session = loadSession();
  const currentUserId = session?.user?.id ?? "";

  /* Animação de entrada */
  useEffect(() => {
    const t = setTimeout(() => setAppeared(true), 400);
    return () => clearTimeout(t);
  }, []);

  /* Sincroniza activeOrderId com a URL */
  useEffect(() => {
    setActiveOrderId(urlOrderId);
  }, [urlOrderId]);

  /* Busca número WhatsApp */
  useEffect(() => {
    void getClientCheckoutPaymentSettings()
      .then((s) => setWaNumber(s.whatsappNumber || undefined))
      .catch(() => {});
  }, []);

  /* Busca lista de pedidos */
  const fetchOrders = useCallback(async () => {
    if (loadingOrders) return;
    setLoadingOrders(true);
    try {
      const data = await listOrders(30);
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

  /* Polling de não lidas para todos os pedidos */
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

  /* Zera badge do pedido activo quando abre */
  useEffect(() => {
    if (open && activeOrderId) {
      setUnreadMap((m) => ({ ...m, [activeOrderId]: 0 }));
    }
  }, [open, activeOrderId]);

  prevTotalRef.current = totalUnread;

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <>
      {/* ── Painel flutuante ─────────────────────────────────── */}
      <div
        className={`fixed bottom-[84px] left-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out origin-bottom-left ${
          open
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-500/20 via-transparent to-transparent blur-sm" />

        <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-black/70 ring-1 ring-white/[0.06]">
          {/* Botão fechar */}
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
            /* ── Chat activo ─────────────────────────────────── */
            <div className="flex flex-col">
              {/* Breadcrumb de voltar (só quando o orderId não vem da URL) */}
              {!urlOrderId && (
                <button
                  type="button"
                  onClick={() => setActiveOrderId(null)}
                  className="flex items-center gap-1.5 border-b border-zinc-800/60 bg-zinc-950 px-4 py-2.5 text-[11px] font-medium text-zinc-500 transition hover:text-amber-400"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M8 1L3 6l5 5" />
                  </svg>
                  Voltar aos pedidos
                </button>
              )}
              <ChatBox
                orderId={activeOrderId}
                currentUserId={currentUserId}
                peerLabel={activeOrder ? `Pedido ${activeOrder.orderNumber}` : "Equipa Dádiva"}
                whatsappNumber={waNumber}
                maxH="340px"
              />
            </div>
          ) : (
            /* ── Selector de pedido ──────────────────────────── */
            <div className="flex flex-col overflow-hidden rounded-2xl bg-[#0a0a0a]">
              {/* Cabeçalho do selector */}
              <div className="relative overflow-hidden px-5 py-4">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-950/30 via-zinc-900/60 to-zinc-900/80" />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                <div className="relative flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30">
                    <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white leading-none">Equipa Dádiva</p>
                    <p className="mt-1 text-[10px] text-zinc-500">Selecciona um pedido para conversar</p>
                  </div>
                </div>
              </div>

              {/* Lista de pedidos */}
              <div className="max-h-[340px] overflow-y-auto divide-y divide-zinc-800/40">
                {loadingOrders && orders.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-800 border-t-amber-400" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                    <p className="text-sm text-zinc-500">Sem pedidos ainda.</p>
                    <p className="mt-1 text-[11px] text-zinc-700">Cria um pedido para começar a conversar.</p>
                  </div>
                ) : (
                  orders.map((o) => {
                    const unread = unreadMap[o.id] ?? 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setActiveOrderId(o.id)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-900/60 group"
                      >
                        {/* Ícone de estado */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 ring-1 ring-white/5">
                          <span className={`h-2 w-2 rounded-full ${statusDot(o.status)}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                            {o.orderNumber}
                          </p>
                          <p className="mt-0.5 text-[10px] text-zinc-600">
                            {orderStatusLabel(o.status)}
                          </p>
                        </div>

                        {/* Badge não lidas */}
                        {unread > 0 ? (
                          <span className="flex h-5 min-w-5 shrink-0 animate-pulse items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-zinc-950">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : (
                          <svg className="h-4 w-4 shrink-0 text-zinc-700 group-hover:text-zinc-500 transition-colors" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M6 12l4-4-4-4" />
                          </svg>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Rodapé do selector */}
              {waNumber && (
                <div className="border-t border-zinc-800/50 px-4 py-3">
                  <a
                    href={`https://wa.me/${waNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 py-2.5 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/15"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                    Contactar por WhatsApp
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Botão FAB ─────────────────────────────────────────── */}
      <div
        className={`fixed bottom-4 left-4 z-50 transition-all duration-500 ${
          appeared ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Fechar chat" : "Abrir chat"}
          className={`group relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl transition-all duration-200 active:scale-95 ${
            open
              ? "bg-zinc-800 shadow-black/50 hover:bg-zinc-700"
              : "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-600/40 hover:from-amber-300 hover:to-amber-500"
          }`}
        >
          <span
            className={`absolute transition-all duration-200 ${
              open ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 rotate-90"
            }`}
          >
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </span>
          <span
            className={`absolute transition-all duration-200 ${
              open ? "scale-0 opacity-0 -rotate-90" : "scale-100 opacity-100 rotate-0"
            }`}
          >
            <svg className="h-6 w-6 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
            </svg>
          </span>

          {/* Badge total de não lidas */}
          {!open && totalUnread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-md shadow-red-500/40">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}

          {/* Tooltip */}
          <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 text-[11px] font-semibold text-zinc-300 opacity-0 shadow-xl backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {open
              ? "Fechar chat"
              : totalUnread > 0
              ? `${totalUnread} mensagem${totalUnread > 1 ? "s" : ""} não lida${totalUnread > 1 ? "s" : ""}`
              : "Chat com a equipa"}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-800" />
          </span>
        </button>

        {/* Anel de pulse */}
        {!open && totalUnread > 0 && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-2xl bg-amber-400/25" />
        )}
      </div>
    </>
  );
}
