"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listMessages,
  markMessagesRead,
  sendMessage,
  type ChatMessage,
} from "@/lib/api-client";

const POLL_MS = 5000;

/* ─── Utilitários de tempo ──────────────────────────────────── */
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(d);
}

/* ─── Avatar com iniciais ───────────────────────────────────── */
function Avatar({ name, mine }: { name: string; mine: boolean }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (mine) return null;

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-[10px] font-bold text-black shadow-md">
      {initials || "?"}
    </div>
  );
}

/* ─── Ícone de leitura ──────────────────────────────────────── */
function ReadTick({ read }: { read: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-colors ${read ? "text-amber-400" : "text-zinc-600"}`}
      viewBox="0 0 20 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6l4 4L13 2" />
      <path d="M7 6l4 4 8-8" />
    </svg>
  );
}

/* ─── Props ─────────────────────────────────────────────────── */
type Props = {
  orderId: string;
  currentUserId: string;
  maxH?: string;
  peerLabel?: string;
  whatsappNumber?: string;
  orderNumber?: string;
};

/* ─── Componente principal ──────────────────────────────────── */
export function ChatBox({
  orderId,
  currentUserId,
  maxH = "400px",
  peerLabel = "Equipa Dádiva",
  whatsappNumber,
  orderNumber,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestCreatedAt = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  const fetchMessages = useCallback(
    async (initial = false) => {
      try {
        const data = await listMessages(
          orderId,
          initial ? undefined : latestCreatedAt.current,
        );
        if (data.length === 0) return;
        setMessages((prev) => {
          if (initial) return data;
          const ids = new Set(prev.map((m) => m.id));
          const newOnes = data.filter((m) => !ids.has(m.id));
          return newOnes.length ? [...prev, ...newOnes] : prev;
        });
        latestCreatedAt.current = data[data.length - 1]?.createdAt;
        setLoadErr(null);
      } catch {
        if (initial) setLoadErr("Não foi possível carregar as mensagens.");
      }
    },
    [orderId],
  );

  useEffect(() => {
    void fetchMessages(true).then(() => scrollToBottom());
  }, [fetchMessages, scrollToBottom]);

  useEffect(() => {
    const id = setInterval(() => void fetchMessages(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    void markMessagesRead(orderId).catch(() => {});
  }, [orderId, messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      const msg = await sendMessage(orderId, text);
      setMessages((prev) =>
        prev.find((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      latestCreatedAt.current = msg.createdAt;
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  /* agrupamento por dia */
  const grouped: { day: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.msgs.push(msg);
    else grouped.push({ day, msgs: [msg] });
  }

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800/50 bg-[#0a0a0a] shadow-2xl shadow-black/60">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between gap-3 overflow-hidden px-5 py-3.5">
        {/* fundo gradiente suave */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-950/30 via-zinc-900/60 to-zinc-900/80" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

        <div className="relative flex items-center gap-3">
          {/* logo / ícone */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30">
            <svg className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">{peerLabel}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_1px_rgba(52,211,153,0.7)]" />
              <span className="text-[10px] text-emerald-400/80 font-medium">Online</span>
            </div>
          </div>
        </div>

        {/* Botão WhatsApp */}
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}${
              orderNumber
                ? `?text=Ol%C3%A1%2C+tenho+uma+quest%C3%A3o+sobre+o+pedido+${encodeURIComponent(orderNumber)}`
                : ""
            }`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-400 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-300"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
            WhatsApp
          </a>
        )}
      </div>

      {/* ── Área de mensagens ────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800"
        style={{
          maxHeight: maxH,
          backgroundImage:
            "radial-gradient(circle at 20% 80%, rgba(180,120,0,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(180,120,0,0.03) 0%, transparent 50%)",
        }}
      >
        {loadErr ? (
          /* Erro de carregamento */
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/40 ring-1 ring-red-500/20">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <p className="mt-3 text-xs text-red-400">{loadErr}</p>
          </div>
        ) : messages.length === 0 ? (
          /* Estado vazio */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-amber-700/5 ring-1 ring-amber-500/15">
              <svg className="h-7 w-7 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
              </svg>
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-black">
                0
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-400">Sem mensagens ainda</p>
            <p className="mt-1 max-w-[200px] text-[11px] leading-relaxed text-zinc-600">
              Envia uma mensagem para iniciar a conversa com a equipa.
            </p>
          </div>
        ) : (
          grouped.map(({ day, msgs }) => (
            <div key={day}>
              {/* Separador de dia */}
              <div className="flex items-center gap-3 py-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800/80" />
                <span className="rounded-full border border-zinc-800/80 bg-zinc-900 px-3 py-1 text-[10px] font-semibold text-zinc-500">
                  {day}
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800/80" />
              </div>

              {/* Mensagens do dia */}
              <div className="space-y-1.5">
                {msgs.map((msg, i) => {
                  const isMine = msg.sender.id === currentUserId;
                  const nextMsg = msgs[i + 1];
                  const isLast =
                    !nextMsg || nextMsg.sender.id !== msg.sender.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {/* Avatar — só no último do grupo */}
                      <div className="w-7 shrink-0">
                        {!isMine && isLast && (
                          <Avatar name={msg.sender.name} mine={false} />
                        )}
                      </div>

                      {/* Balão */}
                      <div
                        className={`flex max-w-[72%] flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
                      >
                        {/* Nome do remetente (apenas 1.ª mensagem do grupo) */}
                        {!isMine && (i === 0 || msgs[i - 1]?.sender.id !== msg.sender.id) && (
                          <span className="pl-1 text-[10px] font-semibold text-amber-400/70">
                            {msg.sender.name}
                          </span>
                        )}

                        <div
                          className={`relative px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                            isMine
                              ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-amber-400 to-amber-500 text-zinc-950 font-medium shadow-amber-500/20"
                              : "rounded-2xl rounded-bl-sm bg-zinc-800/80 text-zinc-100 ring-1 ring-white/5"
                          }`}
                        >
                          {msg.content}
                        </div>

                        {/* Horário + tick de leitura */}
                        <div
                          className={`flex items-center gap-1.5 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                        >
                          <span className="text-[10px] text-zinc-600">
                            {formatTime(msg.createdAt)}
                          </span>
                          {isMine && <ReadTick read={!!msg.readAt} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Área de input ────────────────────────────────────────── */}
      <div className="border-t border-zinc-800/50 bg-zinc-950/80 p-3">
        <div
          className={`flex items-end gap-2 rounded-2xl border bg-zinc-900/80 px-4 py-3 transition-all ${
            draft.trim()
              ? "border-amber-400/40 ring-1 ring-amber-400/10"
              : "border-zinc-800/60"
          }`}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Escreve uma mensagem…"
            className="flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />

          {/* Botão enviar */}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
              canSend
                ? "bg-gradient-to-br from-amber-400 to-amber-500 text-zinc-950 shadow-md shadow-amber-500/30 hover:from-amber-300 hover:to-amber-400 active:scale-95"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}
          >
            {sending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-950/20 border-t-zinc-950 block" />
            ) : (
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            )}
          </button>
        </div>

        <p className="mt-2 text-center text-[10px] text-zinc-700">
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-px font-mono text-[9px] text-zinc-600">Enter</kbd>{" "}
          enviar &nbsp;·&nbsp;{" "}
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-px font-mono text-[9px] text-zinc-600">Shift+Enter</kbd>{" "}
          nova linha
        </p>
      </div>
    </div>
  );
}
