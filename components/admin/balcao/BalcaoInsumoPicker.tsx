"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CounterInsumoListItem } from "@/lib/api-client";
import { dadivaInput } from "@/lib/dadiva-ui-classes";

function orderMoneyValue(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(",", ".")) || 0;
  return Number(v) || 0;
}

function optionLabel(r: CounterInsumoListItem): string {
  return `${r.nome} (${orderMoneyValue(r.stockActual)} ${r.unidade})`;
}

type Props = {
  id: string;
  value: string;
  onChange: (insumoId: string) => void;
  rows: CounterInsumoListItem[];
  disabled?: boolean;
};

export function BalcaoInsumoPicker({
  id,
  value,
  onChange,
  rows,
  disabled,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [searchDirty, setSearchDirty] = useState(false);

  const selected = useMemo(
    () => rows.find((r) => r.id === value) ?? null,
    [rows, value],
  );
  const closedLabel = selected ? optionLabel(selected) : "";
  const panelOpen = menuOpen && !disabled;
  const inputValue = panelOpen ? filterText : closedLabel;

  const candidates = useMemo(() => {
    const qEffective =
      panelOpen && !searchDirty && value ? "" : filterText.trim().toLowerCase();
    let list = rows;
    if (qEffective) {
      list = rows.filter(
        (r) =>
          r.nome.toLowerCase().includes(qEffective) ||
          (r.unidade ?? "").toLowerCase().includes(qEffective),
      );
    }
    return [...list].sort((a, b) => a.nome.localeCompare(b.nome, "pt")).slice(0, 100);
  }, [rows, filterText, panelOpen, searchDirty, value]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!panelOpen) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [panelOpen]);

  return (
    <div ref={rootRef} className="relative mt-1">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          type="search"
          autoComplete="off"
          disabled={disabled}
          value={inputValue}
          onChange={(e) => {
            setSearchDirty(true);
            setFilterText(e.target.value);
            setMenuOpen(true);
            onChange("");
          }}
          onFocus={() => {
            setMenuOpen(true);
            setSearchDirty(false);
            setFilterText(selected ? optionLabel(selected) : "");
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          placeholder="Pesquisar…"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          className={`min-w-0 flex-1 ${dadivaInput} !py-2`}
        />
        {value ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setFilterText("");
              setSearchDirty(false);
              setMenuOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
          >
            Limpar
          </button>
        ) : null}
      </div>
      {panelOpen ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-[60] mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
        >
          {candidates.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado.</li>
          ) : (
            candidates.map((r) => (
              <li key={r.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === r.id}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(r.id);
                    setMenuOpen(false);
                    setSearchDirty(false);
                  }}
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {r.nome}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Stock {orderMoneyValue(r.stockActual)} {r.unidade}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
