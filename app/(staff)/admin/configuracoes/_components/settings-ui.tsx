"use client";

import type { ReactNode } from "react";

const inputClass =
  "w-full rounded-xl border border-zinc-700/60 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20";

const labelClass =
  "block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export function Field({
  label,
  hint,
  value,
  onChange,
  mono = false,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  type?: "text" | "email" | "url";
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={`${inputClass} ${mono ? "font-mono tracking-wider" : ""}`}
      />
    </div>
  );
}

export function FieldNumber({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || value)}
        className={inputClass}
      />
    </div>
  );
}

export function FieldPassword({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={inputClass}
      />
    </div>
  );
}

export function FieldTextarea({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={`${inputClass} resize-y`}
      />
    </div>
  );
}

export function ToggleSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3 transition ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-zinc-600"
      }`}
    >
      <div className="min-w-0">
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500">
            {hint}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-amber-400" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function SubPanel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-800/60 bg-zinc-900/40 ${className}`}
    >
      <header className="border-b border-zinc-800/50 px-5 py-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export function InfoCallout({
  title,
  children,
  tone = "neutral",
}: {
  title?: string;
  children: ReactNode;
  tone?: "neutral" | "info" | "success";
}) {
  const tones = {
    neutral: "border-zinc-800/50 bg-zinc-900/30 text-zinc-400",
    info: "border-sky-500/20 bg-sky-950/20 text-sky-200/80",
    success: "border-emerald-500/20 bg-emerald-950/15 text-emerald-200/80",
  };
  return (
    <div className={`rounded-xl border px-4 py-3.5 text-xs leading-relaxed ${tones[tone]}`}>
      {title ? <p className="mb-1 font-semibold text-zinc-200">{title}</p> : null}
      {children}
    </div>
  );
}

export function BankMethodCard({
  title,
  subtitle,
  accent,
  highlight,
  headerExtra,
  children,
}: {
  title: string;
  subtitle: string;
  accent: "violet" | "emerald" | "amber";
  highlight?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const accents = {
    violet: {
      header: "from-violet-600/30 via-violet-500/10 to-transparent border-violet-500/15",
      box: "border-violet-500/20 bg-violet-950/20",
    },
    emerald: {
      header: "from-emerald-600/30 via-emerald-500/10 to-transparent border-emerald-500/15",
      box: "border-emerald-500/20 bg-emerald-950/15",
    },
    amber: {
      header: "from-amber-500/30 via-amber-400/10 to-transparent border-amber-500/15",
      box: "border-amber-500/20 bg-amber-950/15",
    },
  };
  const a = accents[accent];
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/70 to-black/40">
      <div className={`border-b px-4 py-3.5 bg-gradient-to-r ${a.header}`}>
        <h4 className="text-sm font-bold text-white">{title}</h4>
        <p className="mt-1 text-[11px] leading-snug text-zinc-400">{subtitle}</p>
        {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {highlight ? (
          <div className={`rounded-xl border p-3 ${a.box}`}>{highlight}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25"
          : "bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-600"}`}
      />
      {label}
    </span>
  );
}

export type SettingsTabId =
  | "empresa"
  | "aparencia"
  | "pagamentos"
  | "comprovantes"
  | "sistema";

export const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  description: string;
}[] = [
  {
    id: "empresa",
    label: "Empresa",
    description: "Identidade, morada e contactos",
  },
  {
    id: "aparencia",
    label: "Aparência",
    description: "Fundo da página de login",
  },
  {
    id: "pagamentos",
    label: "Pagamentos",
    description: "Checkout e transferências",
  },
  {
    id: "comprovantes",
    label: "Comprovantes",
    description: "Formato do PDF",
  },
  {
    id: "sistema",
    label: "Sistema",
    description: "Email e integrações",
  },
];

export function isSettingsTabId(value: string): value is SettingsTabId {
  return SETTINGS_TABS.some((t) => t.id === value);
}

export function SettingsTabNav({
  active,
  onChange,
  badges,
}: {
  active: SettingsTabId;
  onChange: (id: SettingsTabId) => void;
  badges?: Partial<Record<SettingsTabId, ReactNode>>;
}) {
  return (
    <>
      <nav className="hidden shrink-0 lg:block lg:w-56 xl:w-60">
        <div className="sticky top-6 space-y-1">
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={`w-full rounded-xl px-3.5 py-3 text-left transition ${
                  isActive
                    ? "bg-amber-400/12 ring-1 ring-amber-400/30"
                    : "hover:bg-zinc-900/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-semibold ${isActive ? "text-amber-100" : "text-zinc-300"}`}
                  >
                    {tab.label}
                  </span>
                  {badges?.[tab.id]}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                  {tab.description}
                </p>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-amber-400 text-black"
                  : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function SettingsSaveBar({
  saving,
  saved,
  error,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-zinc-800/80 bg-black/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-[1.25rem] text-sm">
          {error ? (
            <p className="text-red-300">{error}</p>
          ) : saved ? (
            <span className="flex items-center gap-1.5 text-amber-300">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 16 16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M3 8l4 4 6-6" />
              </svg>
              Alterações guardadas
            </span>
          ) : (
            <span className="text-zinc-500">
              As alterações aplicam-se a toda a loja após guardar.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/15 transition hover:from-amber-300 hover:to-amber-400 disabled:cursor-not-allowed disabled:from-zinc-600 disabled:to-zinc-600 disabled:opacity-50 sm:w-auto"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-black/20 border-t-black" />
              A guardar…
            </span>
          ) : (
            "Guardar alterações"
          )}
        </button>
      </div>
    </div>
  );
}
