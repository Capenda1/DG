"use client";

import type { ReactNode } from "react";
import type { RhTabId } from "./rh-utils";
import { RH_TABS } from "./rh-utils";

export const rhInputClass =
  "w-full rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20";

export const rhLabelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export const rhBtnGhost =
  "inline-flex items-center justify-center rounded-lg border border-zinc-600/50 bg-zinc-800/40 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 disabled:opacity-50";

export const rhBtnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50";

export const rhBtnPrimarySm =
  "inline-flex items-center justify-center rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50";

export const rhBtnQuick =
  "rounded-md border border-zinc-600/50 bg-zinc-900/80 px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50";

export function RhBadge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function RhKpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "amber";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : tone === "amber"
            ? "text-amber-200"
            : "text-white";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

export function RhCard({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-zinc-900/35 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function RhTable({
  children,
  empty,
  isEmpty = false,
}: {
  children: ReactNode;
  empty?: ReactNode;
  /** Quando true, mostra `empty` em vez da tabela. */
  isEmpty?: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700/50 px-5 py-10 text-center text-sm text-zinc-500">
        {empty ?? "Sem dados."}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function RhTh({ children }: { children?: ReactNode }) {
  return (
    <th className="border-b border-white/[0.06] bg-zinc-950/50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </th>
  );
}

export function RhTd({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`border-b border-white/[0.04] px-3 py-2.5 text-zinc-300 ${className}`}>
      {children}
    </td>
  );
}

export function RhTabs({
  active,
  onChange,
}: {
  active: RhTabId;
  onChange: (tab: RhTabId) => void;
}) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-950/50 p-1"
      aria-label="Secções RH"
    >
      {RH_TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-w-[7.5rem] flex-1 rounded-lg px-3 py-2.5 text-left transition ${
              selected
                ? "bg-amber-400 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
            }`}
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span className={`block text-[10px] ${selected ? "text-zinc-800" : "text-zinc-600"}`}>
              {tab.hint}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function RhPageHeader({
  periodKey,
  selectedPeriod,
  onPeriodChange,
  linkSlot,
}: {
  periodKey: string;
  selectedPeriod: string;
  onPeriodChange: (value: string) => void;
  linkSlot: ReactNode;
}) {
  return (
    <header className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/90">
            Administração
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Recursos Humanos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Equipa, documentos, ponto e salários num só lugar. Contas em {linkSlot}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={rhLabelClass}>Período</label>
            <input
              type="month"
              className={`${rhInputClass} min-w-[10rem]`}
              value={selectedPeriod}
              onChange={(e) => onPeriodChange(e.target.value)}
            />
          </div>
          {periodKey ? (
            <p className="text-xs text-zinc-500">A consultar: {periodKey}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function RhModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="Fechar diálogo"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
