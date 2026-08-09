"use client";

import type { CounterClientHit } from "@/lib/api-client";
import { balcaoPdvCard } from "@/lib/balcao-pdv-ui";
import { dadivaInput, dadivaInputReadonly, dadivaLabelCompact } from "@/lib/dadiva-ui-classes";
import { displayPhoneAsMask } from "@/lib/whatsapp-mask";

type Props = {
  selectedClient: CounterClientHit | null;
  clientQuery: string;
  clientHits: CounterClientHit[];
  clientSearchBusy: boolean;
  onClientQueryChange: (q: string) => void;
  onSelectClient: (c: CounterClientHit) => void;
  onClearClient: () => void;
  onEditClient: () => void;
  onQuickReg: () => void;
};

export function BalcaoClienteSection({
  selectedClient,
  clientQuery,
  clientHits,
  clientSearchBusy,
  onClientQueryChange,
  onSelectClient,
  onClearClient,
  onEditClient,
  onQuickReg,
}: Props) {
  return (
    <section className={`${balcaoPdvCard} space-y-3`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
            Cliente
          </h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Pesquisa (mín. 2 caracteres) ou registo rápido.
          </p>
        </div>
        {!selectedClient ? (
          <button
            type="button"
            onClick={onQuickReg}
            className="rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
          >
            + Registo rápido
          </button>
        ) : null}
      </header>

      {selectedClient ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-400/35 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {selectedClient.name}
            </p>
            <p className="truncate text-[11px] text-zinc-600 dark:text-zinc-400">
              {[selectedClient.phone, selectedClient.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={onEditClient}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-bold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={onClearClient}
              className="rounded-md border border-amber-400/45 px-2 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-200"
            >
              Alterar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className={dadivaLabelCompact}>Busca</label>
          <input
            value={clientQuery}
            onChange={(e) => onClientQueryChange(e.target.value)}
            placeholder="Nome, +244 ou e-mail…"
            className={`${dadivaInput} mt-1 !py-2`}
          />
          {clientSearchBusy ? (
            <p className="mt-0.5 text-[10px] text-zinc-500">A pesquisar…</p>
          ) : null}
          {clientHits.length > 0 ? (
            <ul className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-600 dark:bg-zinc-900">
              {clientHits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClient(c)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {[c.phone, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function syncClientFromHit(c: CounterClientHit) {
  return {
    name: c.name ?? "",
    phone: displayPhoneAsMask(c.phone),
    email: c.email ?? "",
  };
}

/** Campos ocultos para validação — quickName etc. mantidos no page. */
export function BalcaoClienteHiddenFields({
  quickName,
  quickPhone,
  quickEmail,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  showManual,
}: {
  quickName: string;
  quickPhone: string;
  quickEmail: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  showManual: boolean;
}) {
  if (!showManual) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={dadivaLabelCompact}>Nome completo *</label>
        <input
          value={quickName}
          onChange={(e) => onNameChange(e.target.value)}
          className={`${dadivaInput} mt-1 !py-2`}
        />
      </div>
      <div>
        <label className={dadivaLabelCompact}>WhatsApp (+244)</label>
        <input
          type="tel"
          value={quickPhone}
          onChange={(e) => onPhoneChange(e.target.value)}
          className={`${dadivaInput} mt-1 !py-2`}
        />
      </div>
      <div>
        <label className={dadivaLabelCompact}>E-mail</label>
        <input
          type="email"
          value={quickEmail}
          onChange={(e) => onEmailChange(e.target.value)}
          className={`${dadivaInputReadonly} ${dadivaInput} mt-1 !py-2`}
        />
      </div>
    </div>
  );
}
