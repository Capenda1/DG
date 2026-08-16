"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  adminUpdateTwilioSmsSettings,
  deleteSmsNotification,
  deleteSmsNotificationsBulk,
  fetchSmsNotificationHistory,
  fetchSmsTwilioStatus,
  fetchTwilioSmsSettings,
  type SmsNotificationHistoryItem,
  type SmsTwilioStatus,
  type TwilioSmsSettings,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import { ROUTES } from "@/lib/routes";
import { displayPhoneAsMask } from "@/lib/whatsapp-mask";

type StatusFilter = "" | "SENT" | "FAILED" | "PENDING";
type TabId = "history" | "settings";

const DEFAULT_TEMPLATE =
  "{cliente}, o pedido {pedido} está finalizado e pronto para recolha.{contacto}{rodape}";

const DEFAULT_FOOTER = " Canal informativo — não responda a este SMS.";

function statusLabel(status: string): string {
  switch (status) {
    case "SENT":
      return "Enviado";
    case "FAILED":
      return "Falhou";
    case "PENDING":
      return "Pendente";
    default:
      return status;
  }
}

function statusTone(status: string): string {
  switch (status) {
    case "SENT":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "FAILED":
      return "border-red-400/30 bg-red-500/10 text-red-200";
    case "PENDING":
      return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    default:
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function previewMessage(
  template: string,
  footer: string,
  _smsFrom: string,
): string {
  const contactLine = " Contacto: +244 923 000 000.";
  return template
    .replace(/\{cliente\}/g, "Maria Silva")
    .replace(/\{empresa\}/g, "Gráfica Dádiva")
    .replace(/\{pedido\}/g, "DG-2026-00014")
    .replace(/\{contacto\}/g, contactLine)
    .replace(/\{rodape\}/g, footer.trim())
    .slice(0, 320);
}

function inputClass() {
  return "mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-3.5 py-2.5 text-sm text-zinc-100 outline-none ring-0 transition placeholder:text-zinc-600 focus:border-amber-400/45 focus:ring-2 focus:ring-amber-400/15";
}

function labelClass() {
  return "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
}

export function AdminSmsHistory() {
  const isAdmin = loadSession()?.user?.role === "ADMIN";

  const [tab, setTab] = useState<TabId>("history");
  const [items, setItems] = useState<SmsNotificationHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    sent: 0,
    failed: 0,
    pending: 0,
    read: 0,
  });
  const [twilioStatus, setTwilioStatus] = useState<SmsTwilioStatus | null>(null);
  const [twilioSettings, setTwilioSettings] = useState<TwilioSmsSettings | null>(
    null,
  );
  const [authTokenInput, setAuthTokenInput] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSmsNotificationHistory({
        q: debouncedSearch.trim() || undefined,
        status: statusFilter || undefined,
        take: 80,
      });
      setItems(data.items);
      setTotal(data.total);
      setSummary(data.summary);
      setSelectedIds(new Set());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível carregar o histórico.",
      );
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  const loadStatus = useCallback(async () => {
    try {
      const status = await fetchSmsTwilioStatus();
      setTwilioStatus(status);
    } catch {
      setTwilioStatus(null);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const s = await fetchTwilioSmsSettings();
      setTwilioSettings(s);
    } catch {
      setTwilioSettings(null);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void loadStatus();
    void loadSettings();
  }, [loadStatus, loadSettings]);

  const allSelected =
    items.length > 0 && items.every((row) => selectedIds.has(row.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteOne = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Eliminar este registo SMS?")) return;
    setDeleting(true);
    try {
      await deleteSmsNotification(id);
      await loadHistory();
      await loadStatus();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível eliminar.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!isAdmin || selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Eliminar ${selectedIds.size} registo(s) SMS? Esta acção não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSmsNotificationsBulk([...selectedIds]);
      await loadHistory();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Não foi possível eliminar.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!isAdmin || !twilioSettings) return;
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const payload: Parameters<typeof adminUpdateTwilioSmsSettings>[0] = {
        enabled: twilioSettings.enabled,
        accountSid: twilioSettings.accountSid,
        smsFrom: twilioSettings.smsFrom,
        messageTemplate: twilioSettings.messageTemplate,
        oneWayFooter: twilioSettings.oneWayFooter,
      };
      if (authTokenInput.trim()) {
        payload.authToken = authTokenInput.trim();
      }
      const next = await adminUpdateTwilioSmsSettings(payload);
      setTwilioSettings(next);
      setAuthTokenInput("");
      setSettingsMsg("Configuração guardada.");
      await loadStatus();
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : "Não foi possível guardar.",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const messagePreview = useMemo(() => {
    if (!twilioSettings) return "";
    return previewMessage(
      twilioSettings.messageTemplate || DEFAULT_TEMPLATE,
      twilioSettings.oneWayFooter ?? DEFAULT_FOOTER,
      twilioSettings.smsFrom,
    );
  }, [twilioSettings]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/30 px-6 py-7 shadow-[0_24px_80px_-40px_rgba(245,158,11,0.35)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/90">
          Comunicações
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          SMS · Pedido finalizado
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Avisos automáticos via Twilio quando o pedido passa a{" "}
          <strong className="font-medium text-zinc-200">Finalizado</strong>.
          {twilioStatus?.enabled ? (
            <>
              {" "}
              Remetente{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 text-amber-200">
                {twilioStatus.smsFrom}
              </code>
              {twilioStatus.oneWayChannel ? " · canal único" : null}
              {twilioStatus.configSource ? (
                <> · origem {twilioStatus.configSource === "database" ? "admin" : ".env"}</>
              ) : null}
            </>
          ) : (
            <> Twilio inactivo — configura na secção abaixo.</>
          )}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Enviados", value: summary.sent, tone: "text-emerald-300" },
          { label: "Falharam", value: summary.failed, tone: "text-red-300" },
          { label: "Pendentes", value: summary.pending, tone: "text-amber-300" },
          { label: "Total filtrado", value: total, tone: "text-zinc-200" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-white/[0.07] bg-zinc-900/55 px-4 py-4 backdrop-blur-sm"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {kpi.label}
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${kpi.tone}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-1.5">
        {(
          [
            ["history", "Histórico"],
            ["settings", "Configuração Twilio"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "settings" ? (
        <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
          {!isAdmin ? (
            <p className="text-sm text-zinc-400">
              Apenas administradores podem editar a configuração Twilio.
            </p>
          ) : !twilioSettings ? (
            <p className="text-sm text-zinc-500">A carregar configuração…</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Conta e mensagem
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-zinc-400">
                    Altera credenciais Twilio e texto SMS sem editar código ou
                    ficheiros <code className="text-zinc-300">.env</code>.
                    Quando activo, estes valores têm prioridade sobre variáveis
                    de ambiente.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={twilioSettings.enabled}
                    onChange={(e) =>
                      setTwilioSettings((s) =>
                        s ? { ...s, enabled: e.target.checked } : s,
                      )
                    }
                    className="h-4 w-4 rounded border-zinc-600 accent-amber-400"
                  />
                  <span className="text-sm font-medium text-zinc-200">
                    Twilio activo (base de dados)
                  </span>
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className={labelClass()}>Account SID</label>
                  <input
                    className={inputClass()}
                    value={twilioSettings.accountSid}
                    onChange={(e) =>
                      setTwilioSettings((s) =>
                        s ? { ...s, accountSid: e.target.value } : s,
                      )
                    }
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelClass()}>Auth Token</label>
                  <input
                    type="password"
                    className={inputClass()}
                    value={authTokenInput}
                    onChange={(e) => setAuthTokenInput(e.target.value)}
                    placeholder={
                      twilioSettings.hasAuthToken
                        ? "•••••••• (deixar vazio para manter)"
                        : "Token Twilio"
                    }
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className={labelClass()}>Remetente (Sender ID)</label>
                  <input
                    className={inputClass()}
                    value={twilioSettings.smsFrom}
                    onChange={(e) =>
                      setTwilioSettings((s) =>
                        s ? { ...s, smsFrom: e.target.value } : s,
                      )
                    }
                    placeholder="GRAF DADIVA"
                    maxLength={11}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Máx. 11 caracteres · alfanumérico = canal único (sem resposta)
                  </p>
                </div>
                <div>
                  <label className={labelClass()}>Rodapé (canal único)</label>
                  <input
                    className={inputClass()}
                    value={twilioSettings.oneWayFooter}
                    onChange={(e) =>
                      setTwilioSettings((s) =>
                        s ? { ...s, oneWayFooter: e.target.value } : s,
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelClass()}>Modelo da mensagem</label>
                <textarea
                  className={`${inputClass()} min-h-[88px] resize-y font-mono text-[13px]`}
                  value={twilioSettings.messageTemplate}
                  onChange={(e) =>
                    setTwilioSettings((s) =>
                      s ? { ...s, messageTemplate: e.target.value } : s,
                    )
                  }
                  rows={3}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {["{cliente}", "{empresa}", "{pedido}", "{contacto}", "{rodape}"].map(
                    (ph) => (
                      <span
                        key={ph}
                        className="rounded-lg border border-amber-400/20 bg-amber-400/8 px-2 py-1 font-mono text-[11px] text-amber-200/90"
                      >
                        {ph}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
                  Pré-visualização
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                  {messagePreview}
                </p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Remetente no telemóvel:{" "}
                  <strong className="text-zinc-300">
                    {twilioSettings.smsFrom || "—"}
                  </strong>
                </p>
              </div>

              {settingsMsg ? (
                <p
                  className={`text-sm ${settingsMsg.includes("guardada") ? "text-emerald-300" : "text-red-300"}`}
                >
                  {settingsMsg}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={settingsSaving}
                  onClick={() => void handleSaveSettings()}
                  className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition hover:brightness-105 disabled:opacity-50"
                >
                  {settingsSaving ? "A guardar…" : "Guardar configuração"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.04]"
                  onClick={() => {
                    setTwilioSettings((s) =>
                      s
                        ? {
                            ...s,
                            messageTemplate: DEFAULT_TEMPLATE,
                            oneWayFooter: DEFAULT_FOOTER,
                            smsFrom: "GRAF DADIVA",
                          }
                        : s,
                    );
                  }}
                >
                  Restaurar modelo predefinido
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_11rem]">
              <div>
                <label className={labelClass()}>Pesquisar</label>
                <input
                  type="search"
                  className={inputClass()}
                  placeholder="Pedido, cliente, texto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass()}>Estado</label>
                <select
                  className={inputClass()}
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                >
                  <option value="">Todos</option>
                  <option value="SENT">Enviado</option>
                  <option value="FAILED">Falhou</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.04]"
                onClick={() => void loadHistory()}
                disabled={loading}
              >
                Actualizar
              </button>
              {isAdmin && selectedIds.size > 0 ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteSelected()}
                  className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-50"
                >
                  Eliminar ({selectedIds.size})
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="space-y-3 py-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl bg-white/[0.04]"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
              <p className="text-sm text-zinc-500">Nenhum SMS registado ainda.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Marca um pedido como Finalizado para gerar o primeiro envio.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {isAdmin ? (
                <label className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-zinc-600 accent-amber-400"
                  />
                  Seleccionar todos
                </label>
              ) : null}

              {items.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <article
                      className={`rounded-2xl border transition ${
                        expanded
                          ? "border-amber-400/25 bg-amber-400/[0.04]"
                          : "border-white/[0.07] bg-black/20 hover:border-white/12"
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap">
                        {isAdmin ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="mt-1 rounded border-zinc-600 accent-amber-400"
                            aria-label={`Seleccionar ${row.orderNumber ?? row.id}`}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(row.status)}`}
                            >
                              {statusLabel(row.status)}
                            </span>
                            {row.orderNumber ? (
                              <Link
                                href={`${ROUTES.admin.pedidos}?q=${encodeURIComponent(row.orderNumber)}`}
                                className="font-semibold text-amber-300 hover:underline"
                              >
                                {row.orderNumber}
                              </Link>
                            ) : null}
                            <span className="text-xs text-zinc-500">
                              {formatDateTime(row.sentAt ?? row.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
                            {row.body}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {row.recipientName}
                            {row.to ? ` · ${displayPhoneAsMask(row.to)}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-400/10"
                            onClick={() =>
                              setExpandedId(expanded ? null : row.id)
                            }
                          >
                            {expanded ? "Ocultar" : "Detalhes"}
                          </button>
                          {isAdmin ? (
                            <button
                              type="button"
                              disabled={deleting}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-400/10 disabled:opacity-40"
                              onClick={() => void handleDeleteOne(row.id)}
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {expanded ? (
                        <div className="border-t border-white/[0.06] px-4 py-4 text-sm">
                          <dl className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                                Mensagem completa
                              </dt>
                              <dd className="mt-1 text-zinc-300">{row.body}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                                Referência Twilio
                              </dt>
                              <dd className="mt-1 font-mono text-xs text-zinc-400">
                                {row.twilioSid ?? "—"}
                              </dd>
                            </div>
                            {row.sentByName ? (
                              <div>
                                <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                                  Registado por
                                </dt>
                                <dd className="mt-1 text-zinc-400">
                                  {row.sentByName}
                                </dd>
                              </div>
                            ) : null}
                            {row.error || row.skipReason ? (
                              <div className="sm:col-span-2">
                                <dt className="text-[10px] uppercase tracking-wider text-red-400/70">
                                  Erro / motivo
                                </dt>
                                <dd className="mt-1 text-red-200/90">
                                  {row.error ?? row.skipReason}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                      ) : null}
                    </article>
                  </Fragment>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
