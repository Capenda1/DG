"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchOrderCustomerNotifications,
  notifyOrderCustomer,
  type ApiRequestError,
  type OrderCustomerNotificationsResponse,
  type OrderNotifyChannel,
} from "@/lib/api-client";
import { displayPhoneAsMask } from "@/lib/whatsapp-mask";
import { useAnimatedConfirm } from "@/components/providers/AnimatedConfirmProvider";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function channelLabel(channel: OrderNotifyChannel): string {
  if (channel === "SMS") return "SMS";
  if (channel === "EMAIL") return "Email";
  return "WhatsApp";
}

function lastHint(
  data: OrderCustomerNotificationsResponse | null,
  channel: OrderNotifyChannel,
): string {
  const last = data?.lastByChannel[channel];
  if (!last) return "Ainda sem envio";
  const when = formatWhen(last.sentAt ?? last.createdAt);
  if (last.status === "FAILED") {
    return `Falhou · ${when}`;
  }
  if (channel === "WHATSAPP") {
    return `Link aberto · ${when}`;
  }
  return `Enviado · ${when}`;
}

type Props = {
  orderId: string;
  orderStatus: string;
};

export function OrderNotifyClientPanel({ orderId, orderStatus }: Props) {
  const confirmAction = useAnimatedConfirm();
  const [data, setData] = useState<OrderCustomerNotificationsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<OrderNotifyChannel | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const next = await fetchOrderCustomerNotifications(orderId);
      setData(next);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar os avisos.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function askNotifyConfirm(
    channel: OrderNotifyChannel,
  ): Promise<boolean> {
    const phone = displayPhoneAsMask(data?.contacts.phone) || data?.contacts.phoneE164 || "o cliente";
    const email = data?.contacts.email?.trim() || "o cliente";
    const name = data?.contacts.name?.trim() || "o cliente";

    if (channel === "SMS") {
      return confirmAction({
        title: "Enviar SMS",
        message: `Avisar ${name} de que o pedido está pronto para recolha?`,
        hint: `Destino ${phone} · esta mensagem tem custo Twilio.`,
        confirmLabel: "Enviar SMS",
        cancelLabel: "Cancelar",
      });
    }
    if (channel === "EMAIL") {
      return confirmAction({
        title: "Enviar email",
        message: `Enviar o aviso de recolha para ${name}?`,
        hint: email,
        confirmLabel: "Enviar email",
        cancelLabel: "Cancelar",
      });
    }
    return confirmAction({
      title: "Abrir WhatsApp",
      message: `Abrir uma conversa com ${name} com o texto já preenchido?`,
      hint: `${phone} · confirmas o envio na app WhatsApp.`,
      confirmLabel: "Abrir WhatsApp",
      cancelLabel: "Cancelar",
    });
  }

  async function runNotify(
    channel: OrderNotifyChannel,
    confirmResend = false,
  ): Promise<void> {
    setBusy(channel);
    setMsg(null);
    setErr(null);
    try {
      const result = await notifyOrderCustomer(orderId, channel, {
        confirmResend,
      });
      if (channel === "WHATSAPP" && result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
        setMsg("WhatsApp aberto com a mensagem pronta — confirme o envio na app.");
      } else if (channel === "SMS") {
        setMsg(`SMS enviado para ${result.to ?? "o cliente"}.`);
      } else {
        setMsg(`Email enviado para ${result.to ?? "o cliente"}.`);
      }
      await reload();
    } catch (e) {
      const status = (e as ApiRequestError)?.status;
      if (status === 409) {
        const label = channelLabel(channel);
        const ok = await confirmAction({
          title: `Já enviado por ${label}`,
          message: `Este pedido já tem um aviso por ${label}. Queres enviar outra vez?`,
          hint:
            channel === "SMS"
              ? "Um novo SMS volta a ter custo Twilio."
              : channel === "EMAIL"
                ? "Um novo email será enviado para o endereço do cliente."
                : "Abre outra conversa no WhatsApp com o mesmo texto.",
          confirmLabel: channel === "WHATSAPP" ? "Abrir de novo" : "Reenviar",
          cancelLabel: "Cancelar",
        });
        if (ok) {
          setBusy(null);
          await runNotify(channel, true);
          return;
        }
        setErr(null);
      } else {
        setErr(
          e instanceof Error ? e.message : `Falha ao notificar por ${channel}.`,
        );
      }
    } finally {
      setBusy(null);
    }
  }

  const phoneDisplay = displayPhoneAsMask(data?.contacts.phone) || "—";
  const emailDisplay = data?.contacts.email?.trim() || "—";
  const showReadyHint =
    orderStatus === "FINISHED" || orderStatus === "DELIVERED";

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-950/15 px-4 py-3 text-xs ring-1 ring-sky-400/10">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300/90">
        Avisar cliente
      </p>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        {data?.smsSendMode === "automatic"
          ? "SMS automático está activo ao finalizar. Podes ainda enviar manualmente aqui."
          : "SMS em modo manual — só envia se clicares no botão (controla o custo)."}{" "}
        {showReadyHint
          ? "Recomendado quando o pedido está pronto para recolha."
          : "Podes avisar em qualquer fase; o cliente recebe o texto de «pronto para recolha»."}
      </p>

      {loading && !data ? (
        <p className="text-[11px] text-zinc-500">A carregar contactos…</p>
      ) : (
        <>
          <div className="mb-3 space-y-1 text-[11px] text-zinc-400">
            <p>
              <span className="text-zinc-600">Telefone · </span>
              <span className="tabular-nums text-zinc-200">{phoneDisplay}</span>
            </p>
            <p>
              <span className="text-zinc-600">Email · </span>
              <span className="break-all text-zinc-200">{emailDisplay}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {(
              [
                {
                  channel: "WHATSAPP" as const,
                  title: "Abrir WhatsApp",
                  hint: lastHint(data, "WHATSAPP"),
                  ready: data?.channelsReady.WHATSAPP,
                  disabledReason: "Telefone inválido ou em falta",
                },
                {
                  channel: "SMS" as const,
                  title: "Enviar SMS",
                  hint: lastHint(data, "SMS"),
                  ready: data?.channelsReady.SMS,
                  disabledReason: !data?.contacts.phoneE164
                    ? "Telefone inválido ou em falta"
                    : data?.smsInactiveReason || "Twilio inactivo",
                },
                {
                  channel: "EMAIL" as const,
                  title: "Enviar email",
                  hint: lastHint(data, "EMAIL"),
                  ready: data?.channelsReady.EMAIL,
                  disabledReason: !data?.contacts.email?.trim()
                    ? "Email em falta"
                    : data?.emailInactiveReason || "SMTP inactivo",
                },
              ] as const
            ).map((btn) => {
              const disabled = !!busy || !btn.ready;
              return (
                <div key={btn.channel}>
                  <button
                    type="button"
                    disabled={disabled}
                    title={
                      !btn.ready ? btn.disabledReason : btn.hint
                    }
                    onClick={() => {
                      void (async () => {
                        const ok = await askNotifyConfirm(btn.channel);
                        if (!ok) return;
                        await runNotify(btn.channel);
                      })();
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      btn.channel === "WHATSAPP"
                        ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                        : btn.channel === "SMS"
                          ? "border border-amber-400/30 bg-amber-400/12 text-amber-100 hover:bg-amber-400/22"
                          : "border border-sky-400/30 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                    }`}
                  >
                    <span>
                      {busy === btn.channel ? "A processar…" : btn.title}
                    </span>
                    <span className="text-[10px] font-normal text-zinc-500">
                      {btn.hint}
                    </span>
                  </button>
                  {!btn.ready ? (
                    <p className="mt-0.5 px-0.5 text-[10px] text-zinc-600">
                      {btn.disabledReason}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {msg ? (
            <p className="mt-3 text-[11px] text-emerald-300" role="status">
              {msg}
            </p>
          ) : null}
          {err ? (
            <p className="mt-3 text-[11px] text-red-300" role="alert">
              {err}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
