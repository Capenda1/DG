"use client";

import { useMemo, useState } from "react";
import {
  CATALOG_FAMILIES,
  CATALOG_FAMILY_ACCENTS,
  type CatalogFamily,
  type ProductCatalogTemplate,
  newCatalogTemplateId,
} from "@/lib/product-catalog";
import type { ApparelProductType } from "@/lib/apparel-catalog";

const inputClass =
  "w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/15";

const GARMENT_OPTIONS: { id: ApparelProductType; label: string }[] = [
  { id: "T_SHIRT", label: "T-shirt" },
  { id: "POLO", label: "Polo" },
  { id: "COLETE", label: "Colete" },
  { id: "BONE", label: "Boné" },
  { id: "PERSONALIZADO", label: "Personalizado" },
  { id: "EQUIPAMENTOS", label: "Equipamentos" },
];

export function AdminCatalogTemplatesModal({
  templates,
  saving,
  onClose,
  onSave,
}: {
  templates: ProductCatalogTemplate[];
  saving: boolean;
  onClose: () => void;
  onSave: (templates: ProductCatalogTemplate[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<ProductCatalogTemplate[]>(() =>
    [...templates].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [err, setErr] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<CatalogFamily, ProductCatalogTemplate[]>();
    for (const f of CATALOG_FAMILIES) map.set(f.id, []);
    for (const t of rows) {
      const list = map.get(t.catalogFamily) ?? [];
      list.push(t);
      map.set(t.catalogFamily, list);
    }
    return map;
  }, [rows]);

  function updateRow(id: string, patch: Partial<ProductCatalogTemplate>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function addRow(family: CatalogFamily) {
    setRows((prev) => [
      ...prev,
      {
        id: newCatalogTemplateId(),
        catalogFamily: family,
        code: "",
        name: "",
        hint: "",
        accent: CATALOG_FAMILY_ACCENTS[family],
        garmentType: family === "VESTUARIO" ? "T_SHIRT" : undefined,
        sortOrder: prev.length,
        active: true,
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSave() {
    setErr(null);
    for (const r of rows) {
      if (!r.code.trim() || !r.name.trim()) {
        setErr("Todos os modelos precisam de código e nome.");
        return;
      }
      if (r.catalogFamily === "VESTUARIO" && !r.garmentType) {
        setErr(`Modelo vestuário «${r.code}» precisa de tipo de peça.`);
        return;
      }
    }
    const codes = new Set<string>();
    for (const r of rows) {
      const k = r.code.trim().toUpperCase();
      if (codes.has(k)) {
        setErr(`Código duplicado: ${r.code}`);
        return;
      }
      codes.add(k);
    }
    const normalized = rows.map((r, i) => ({
      ...r,
      code: r.code.trim().toUpperCase(),
      name: r.name.trim(),
      hint: r.hint.trim(),
      sortOrder: i,
    }));
    try {
      await onSave(normalized);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível guardar.");
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/[0.1] bg-zinc-950/95 shadow-2xl shadow-black/60">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-400/90">
              Catálogo
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">Modelos editáveis</h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-500">
              Atalhos ao criar produtos. Vestuário usa matriz automática; outras
              famílias usam variantes manuais por agora.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {err ? (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {err}
            </p>
          ) : null}

          {CATALOG_FAMILIES.map((family) => {
            const list = grouped.get(family.id) ?? [];
            return (
              <section key={family.id} className="mb-6 last:mb-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{family.label}</h3>
                    <p className="text-[11px] text-zinc-500">{family.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addRow(family.id)}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/5"
                  >
                    + Modelo
                  </button>
                </div>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-600">
                    Sem modelos nesta família.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {list.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-2xl border border-white/[0.08] bg-black/25 p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block text-[10px] font-semibold uppercase text-zinc-500">
                            Código
                            <input
                              className={`${inputClass} mt-1 font-mono`}
                              value={t.code}
                              onChange={(e) =>
                                updateRow(t.id, {
                                  code: e.target.value.toUpperCase(),
                                })
                              }
                              placeholder="CANECA"
                            />
                          </label>
                          <label className="block text-[10px] font-semibold uppercase text-zinc-500">
                            Nome
                            <input
                              className={`${inputClass} mt-1`}
                              value={t.name}
                              onChange={(e) =>
                                updateRow(t.id, { name: e.target.value })
                              }
                            />
                          </label>
                          <label className="block text-[10px] font-semibold uppercase text-zinc-500 sm:col-span-2">
                            Descrição curta
                            <input
                              className={`${inputClass} mt-1`}
                              value={t.hint}
                              onChange={(e) =>
                                updateRow(t.id, { hint: e.target.value })
                              }
                            />
                          </label>
                          {t.catalogFamily === "VESTUARIO" ? (
                            <label className="block text-[10px] font-semibold uppercase text-zinc-500">
                              Tipo de peça
                              <select
                                className={`${inputClass} mt-1`}
                                value={t.garmentType ?? "T_SHIRT"}
                                onChange={(e) =>
                                  updateRow(t.id, {
                                    garmentType: e.target
                                      .value as ApparelProductType,
                                  })
                                }
                              >
                                {GARMENT_OPTIONS.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={t.active}
                              onChange={(e) =>
                                updateRow(t.id, { active: e.target.checked })
                              }
                              className="rounded border-white/20"
                            />
                            Activo no «Novo produto»
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRow(t.id)}
                            className="text-[11px] font-semibold text-red-400/90 hover:text-red-300"
                          >
                            Remover
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-white/[0.06] p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.04] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? "A guardar…" : "Guardar modelos"}
          </button>
        </div>
      </div>
    </div>
  );
}
