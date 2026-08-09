"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addInsumoCatalogItem,
  addMovimento,
  createInsumo,
  getInsumoCatalogLists,
  getInsumosDashboard,
  listInsumos,
  listMovimentos,
  updateInsumo,
  type Insumo,
  type InsumoCatalogLists,
  type InsumosDashboard,
  type MovimentoInsumo,
} from "@/lib/api-client";
import { loadSession } from "@/lib/auth-session";
import {
  dadivaInput,
  dadivaLabel,
  dadivaSurfaceCard,
} from "@/lib/dadiva-ui-classes";
import {
  MONEY_DECIMAL_PLACES,
  sanitizeUnsignedDecimalString,
  STOCK_DECIMAL_PLACES,
} from "@/lib/numeric-input";

function parseDecimalInput(raw: string): number {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return Number.NaN;
  return parseFloat(s);
}

function stockNum(v: string): number {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatAoAmount(n: number): string {
  return n.toLocaleString("pt-AO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

const MOV_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA_MANUAL: "Saída manual",
  SAIDA_PEDIDO: "Saída (pedido)",
};

const CATEGORIA_LABELS: Record<string, string> = {
  TECIDO: "Tecido",
  TINTA: "Tinta",
  TRANSFER: "Transfer",
  VINIL: "Vinil",
  ETIQUETA: "Etiqueta",
  EMBALAGEM: "Embalagem",
  BORDADO: "Bordado",
  OUTRO: "Outro",
};

function categoriaLabel(key: string): string {
  return CATEGORIA_LABELS[key] ?? key;
}

/** Campos em modais — mesmo padrão visual que Registar cliente / Novo utilizador. */
const stockModalLabel =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500";
const stockModalInput =
  "w-full rounded-xl border border-zinc-600/40 bg-zinc-900/70 px-4 py-3 text-[15px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-zinc-600 focus:border-amber-500/55 focus:ring-2 focus:ring-amber-500/20";
const stockModalBtnPrimary =
  "rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/15 transition hover:from-amber-300 hover:to-amber-400 disabled:opacity-50";
const stockModalBtnGhost =
  "rounded-xl border border-zinc-600/50 bg-zinc-800/40 px-4 py-2.5 text-sm font-medium text-zinc-200 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800/70 disabled:opacity-50";
const stockModalBtnDanger =
  "rounded-xl border border-red-500/50 bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500 disabled:opacity-50";
const stockModalBtnViolet =
  "rounded-xl border border-violet-400/50 bg-gradient-to-r from-violet-600 to-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-violet-500 hover:to-violet-600 disabled:opacity-50";

type StockOpPanel = "entrada" | "saida" | "novo";

function StockOperationModal({
  title,
  children,
  onClose,
  size = "lg",
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "2xl";
  busy?: boolean;
}) {
  const boxClass =
    size === "2xl"
      ? "relative max-h-[min(92vh,900px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/40"
      : size === "lg"
        ? "relative max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/40"
        : "relative max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/40";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar fundo"
        className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-op-modal-title"
        className={boxClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-cyan-400 to-amber-500" />
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2
              id="stock-op-modal-title"
              className="text-lg font-semibold leading-snug tracking-tight text-white"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
              aria-label="Fechar diálogo"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

type CatalogKind = "categoria" | "marca" | "unidade";

function CatalogSelectWithAdd({
  label,
  htmlFor,
  options,
  value,
  onChange,
  kind,
  reloadCatalog,
  disabled,
  allowEmpty,
  emptyLabel,
  variant = "page",
}: {
  label: string;
  htmlFor: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  kind: CatalogKind;
  reloadCatalog: () => Promise<void>;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  variant?: "page" | "modal";
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const mergedOptions = useMemo(() => {
    const seen = new Set(options.map((o) => o.toLowerCase()));
    const out = [...options];
    const v = value.trim();
    if (v && !seen.has(v.toLowerCase())) {
      out.push(v);
    }
    return out.sort((a, b) =>
      (kind === "categoria" ? categoriaLabel(a) : a).localeCompare(
        kind === "categoria" ? categoriaLabel(b) : b,
        "pt",
      ),
    );
  }, [options, value, kind]);

  async function submitAdd() {
    const raw = draft.trim();
    if (!raw) return;
    const max =
      kind === "categoria" ? 64 : kind === "unidade" ? 32 : 120;
    const v = raw.slice(0, max);
    setBusy(true);
    try {
      await addInsumoCatalogItem({ kind, value: v });
      setDraft("");
      setAdding(false);
      onChange(v);
      await reloadCatalog();
    } finally {
      setBusy(false);
    }
  }

  const labelClass = variant === "modal" ? stockModalLabel : dadivaLabel;
  const fieldClass = variant === "modal" ? stockModalInput : dadivaInput;
  const addBtnClass =
    variant === "modal"
      ? "rounded-md border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200 transition hover:bg-violet-500/25 disabled:opacity-50"
      : "rounded-md border border-violet-400/50 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/40 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-900/60";
  const addSubmitClass =
    variant === "modal"
      ? "shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-50"
      : "shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50";

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <label className={labelClass} htmlFor={htmlFor}>
          {label}
        </label>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setAdding((x) => !x)}
          className={addBtnClass}
        >
          {adding ? "Fechar" : "+ Novo"}
        </button>
      </div>
      {adding ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled || busy}
            placeholder={
              kind === "categoria"
                ? "Nome da categoria"
                : kind === "marca"
                  ? "Marca"
                  : "Ex.: kg, rolo"
            }
            className={`${fieldClass} min-w-[8rem] flex-1`}
            maxLength={kind === "categoria" ? 64 : kind === "unidade" ? 32 : 120}
          />
          <button
            type="button"
            disabled={disabled || busy || !draft.trim()}
            onClick={() => void submitAdd()}
            className={addSubmitClass}
          >
            {busy ? "…" : "Adicionar"}
          </button>
        </div>
      ) : null}
      <select
        id={htmlFor}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClass} w-full`}
      >
        {allowEmpty ? (
          <option value="">{emptyLabel ?? "—"}</option>
        ) : null}
        {mergedOptions.map((o) => (
          <option key={o} value={o}>
            {kind === "categoria" ? categoriaLabel(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

type SortMode =
  | "nome"
  | "categoria"
  | "stock_desc"
  | "stock_asc"
  | "alert_first";

function insumoStockLine(r: Insumo): string {
  return `${r.nome} · ${stockNum(r.stockActual)} ${r.unidade}`;
}

/** Combobox pesquisável para escolher insumo activo (entrada de stock). */
function InsumoEntradaPicker({
  id,
  value,
  onChange,
  rows,
  disabled,
  compact,
  variant = "page",
}: {
  id: string;
  value: string;
  onChange: (insumoId: string) => void;
  rows: Insumo[];
  disabled?: boolean;
  /** Estilo mais baixo (bloco entrada de stock). */
  compact?: boolean;
  /** `modal`: campos escuros como nos modais de utilizador/cliente. */
  variant?: "page" | "modal";
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [searchDirty, setSearchDirty] = useState(false);

  const active = useMemo(() => rows.filter((r) => r.activo), [rows]);
  const selected = useMemo(
    () => active.find((r) => r.id === value) ?? null,
    [active, value],
  );
  const closedLabel = selected ? insumoStockLine(selected) : "";

  const panelOpen = menuOpen && !disabled;
  const inputValue = panelOpen ? filterText : closedLabel;

  const candidates = useMemo(() => {
    const qEffective =
      panelOpen && !searchDirty && value ? "" : filterText.trim().toLowerCase();
    let list = active;
    if (qEffective) {
      list = active.filter(
        (r) =>
          r.nome.toLowerCase().includes(qEffective) ||
          r.categoria.toLowerCase().includes(qEffective) ||
          categoriaLabel(r.categoria).toLowerCase().includes(qEffective),
      );
    }
    return [...list]
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
      .slice(0, 80);
  }, [active, filterText, panelOpen, searchDirty, value]);

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
    <div ref={rootRef} className="relative">
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
            setFilterText(selected ? insumoStockLine(selected) : "");
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          placeholder="Pesquisar por nome ou categoria…"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          className={`min-w-0 flex-1 ${
            variant === "modal"
              ? stockModalInput
              : `${dadivaInput} ${compact ? "py-2 text-xs" : ""}`
          }`}
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
              requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              });
            }}
            className={`shrink-0 font-semibold transition disabled:opacity-50 ${
              variant === "modal"
                ? `rounded-xl border border-zinc-600/50 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-800 ${
                    compact
                      ? "px-2 py-1.5 text-[11px]"
                      : "px-3 py-2 text-xs"
                  }`
                : `border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 ${
                    compact
                      ? "rounded-lg px-2 py-1.5 text-[11px]"
                      : "rounded-xl px-3 py-2 text-xs"
                  }`
            }`}
          >
            Limpar
          </button>
        ) : null}
      </div>
      {panelOpen ? (
        <ul
          id={listId}
          role="listbox"
          className={`absolute left-0 right-0 z-[60] mt-1 overflow-auto rounded-xl py-0.5 shadow-lg ${
            variant === "modal"
              ? `max-h-52 border border-zinc-600 bg-zinc-950 ${
                  compact ? "py-0.5" : "py-1"
                }`
              : `border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900 ${
                  compact ? "max-h-40" : "max-h-60 py-1"
                }`
          }`}
        >
          {candidates.length === 0 ? (
            <li
              className={`text-zinc-500 ${variant === "modal" ? "dark:text-zinc-400" : "dark:text-zinc-400"} ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5 text-sm"}`}
            >
              Nenhum insumo corresponde à pesquisa.
            </li>
          ) : (
            candidates.map((r) => (
              <li key={r.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === r.id}
                  className={`flex w-full flex-col gap-0.5 text-left transition ${
                    variant === "modal"
                      ? "hover:bg-zinc-800/90"
                      : "hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  } ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(r.id);
                    setMenuOpen(false);
                    setSearchDirty(false);
                  }}
                >
                  <span
                    className={
                      variant === "modal"
                        ? `font-medium text-zinc-100 ${compact ? "text-xs leading-tight" : ""}`
                        : `font-medium text-zinc-900 dark:text-zinc-100 ${compact ? "text-xs leading-tight" : ""}`
                    }
                  >
                    {r.nome}
                  </span>
                  <span
                    className={
                      variant === "modal"
                        ? `text-zinc-500 ${compact ? "text-[10px] leading-tight" : "text-xs"}`
                        : `text-zinc-500 dark:text-zinc-400 ${compact ? "text-[10px] leading-tight" : "text-xs"}`
                    }
                  >
                    {categoriaLabel(r.categoria)} · stock {stockNum(r.stockActual)}{" "}
                    {r.unidade}
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

export default function AdminInsumosStockPage() {
  const [rows, setRows] = useState<Insumo[]>([]);
  const [dashboard, setDashboard] = useState<InsumosDashboard | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alert_first");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "loading",
  );
  const [err, setErr] = useState<string | null>(null);

  const [formInsumoId, setFormInsumoId] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formNota, setFormNota] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [formSaidaInsumoId, setFormSaidaInsumoId] = useState("");
  const [formSaidaQty, setFormSaidaQty] = useState("");
  const [formSaidaNota, setFormSaidaNota] = useState("");
  const [saidaBusy, setSaidaBusy] = useState(false);
  const [saidaMsg, setSaidaMsg] = useState<string | null>(null);

  const [movOpenId, setMovOpenId] = useState<string | null>(null);
  const [movRows, setMovRows] = useState<MovimentoInsumo[]>([]);
  const [movBusy, setMovBusy] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [catalog, setCatalog] = useState<InsumoCatalogLists | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novoCategoria, setNovoCategoria] = useState("OUTRO");
  const [novoUnidade, setNovoUnidade] = useState("un");
  const [novoPrecoCompra, setNovoPrecoCompra] = useState("");
  const [novoPrecoVenda, setNovoPrecoVenda] = useState("");
  const [novoStockIni, setNovoStockIni] = useState("");
  const [novoStockMin, setNovoStockMin] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [novoMarca, setNovoMarca] = useState("");
  const [novoNotas, setNovoNotas] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const [stockOpPanel, setStockOpPanel] = useState<StockOpPanel | null>(null);

  const [editOpen, setEditOpen] = useState<Insumo | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCategoria, setEditCategoria] = useState("OUTRO");
  const [editUnidade, setEditUnidade] = useState("");
  const [editPrecoCompra, setEditPrecoCompra] = useState("");
  const [editPrecoVenda, setEditPrecoVenda] = useState("");
  const [editStockMin, setEditStockMin] = useState("");
  const [editFornecedor, setEditFornecedor] = useState("");
  const [editMarca, setEditMarca] = useState("");
  const [editNotas, setEditNotas] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(loadSession()?.user?.role === "ADMIN");
  }, []);

  useEffect(() => {
    if (!isAdmin && stockOpPanel != null) {
      setStockOpPanel(null);
    }
  }, [isAdmin, stockOpPanel]);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await getInsumoCatalogLists());
    } catch {
      setCatalog(null);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setErr(null);
    try {
      const [list, dash] = await Promise.all([
        listInsumos(includeInactive),
        getInsumosDashboard(),
      ]);
      setRows(list);
      setDashboard(dash);
      setLoadState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar insumos.");
      setLoadState("error");
    }
  }, [includeInactive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredSorted = useMemo(() => {
    let list = rows;
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.nome.toLowerCase().includes(q) ||
          r.categoria.toLowerCase().includes(q) ||
          categoriaLabel(r.categoria).toLowerCase().includes(q),
      );
    }
    if (categoryFilter) {
      list = list.filter((r) => r.categoria === categoryFilter);
    }

    const low = (r: Insumo) =>
      r.activo &&
      stockNum(r.stockMinimo) > 0 &&
      stockNum(r.stockActual) <= stockNum(r.stockMinimo);

    const sorted = [...list];
    if (sortMode === "nome") {
      sorted.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    } else if (sortMode === "categoria") {
      sorted.sort(
        (a, b) =>
          a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome),
      );
    } else if (sortMode === "stock_desc") {
      sorted.sort((a, b) => stockNum(b.stockActual) - stockNum(a.stockActual));
    } else if (sortMode === "stock_asc") {
      sorted.sort((a, b) => stockNum(a.stockActual) - stockNum(b.stockActual));
    } else if (sortMode === "alert_first") {
      sorted.sort((a, b) => {
        const la = low(a) ? 0 : 1;
        const lb = low(b) ? 0 : 1;
        if (la !== lb) return la - lb;
        return a.nome.localeCompare(b.nome, "pt");
      });
    }
    return sorted;
  }, [rows, filter, categoryFilter, sortMode]);

  const categoryFilterOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.categoria);
    for (const c of catalog?.categorias ?? []) s.add(c);
    return [...s].sort((a, b) =>
      categoriaLabel(a).localeCompare(categoriaLabel(b), "pt"),
    );
  }, [rows, catalog]);

  const catalogCategorias = catalog?.categorias ?? [];
  const catalogMarcas = catalog?.marcas ?? [];
  const catalogUnidades = catalog?.unidades ?? [];

  const novoLucroMargem = useMemo(() => {
    const vStr = novoPrecoVenda.trim();
    const cStr = novoPrecoCompra.trim();
    const v = parseDecimalInput(novoPrecoVenda);
    const c = parseDecimalInput(novoPrecoCompra);
    if (!vStr) {
      return {
        kind: "hint" as const,
        text: "Preencha o preço de venda para calcular lucro e margem.",
      };
    }
    if (!Number.isFinite(v) || v < 0) {
      return { kind: "bad" as const, text: "Preço de venda inválido." };
    }
    if (!cStr) {
      return {
        kind: "hint" as const,
        text: "Indique também o preço de compra (custo) para ver a margem %.",
      };
    }
    if (!Number.isFinite(c) || c < 0) {
      return { kind: "bad" as const, text: "Preço de compra inválido." };
    }
    if (c === 0) {
      return {
        kind: "hint" as const,
        text: "Use preço de compra > 0 para calcular margem sobre o custo.",
      };
    }
    const lucro = v - c;
    const margemSobreCusto = (lucro / c) * 100;
    const margemSobreVenda = v > 0 ? (lucro / v) * 100 : 0;
    return {
      kind: "ok" as const,
      lucro,
      margemSobreCusto,
      margemSobreVenda,
    };
  }, [novoPrecoCompra, novoPrecoVenda]);

  function openEdit(r: Insumo) {
    setEditOpen(r);
    setEditNome(r.nome);
    setEditCategoria(r.categoria);
    setEditUnidade(r.unidade);
    setEditPrecoCompra(String(stockNum(r.custoUnit)));
    setEditPrecoVenda(
      r.precoVenda != null && String(r.precoVenda).trim() !== ""
        ? String(stockNum(String(r.precoVenda)))
        : "",
    );
    setEditStockMin(String(stockNum(r.stockMinimo)));
    setEditFornecedor(r.fornecedor ?? "");
    setEditMarca(r.marca ?? "");
    setEditNotas(r.notas ?? "");
    setEditActivo(r.activo);
    setEditMsg(null);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOpen) return;
    setEditMsg(null);
    const nome = editNome.trim();
    if (nome.length < 2) {
      setEditMsg("Nome com pelo menos 2 caracteres.");
      return;
    }
    const unidade = editUnidade.trim() || "un";
    const pc = parseDecimalInput(editPrecoCompra);
    if (!Number.isFinite(pc) || pc < 0) {
      setEditMsg("Preço de compra inválido.");
      return;
    }
    let precoVenda: number | null = null;
    if (editPrecoVenda.trim() !== "") {
      const pv = parseDecimalInput(editPrecoVenda);
      if (!Number.isFinite(pv) || pv < 0) {
        setEditMsg("Preço de venda inválido.");
        return;
      }
      precoVenda = pv;
    }
    const sm = parseDecimalInput(editStockMin);
    if (!Number.isFinite(sm) || sm < 0) {
      setEditMsg("Stock mínimo inválido.");
      return;
    }
    setEditBusy(true);
    try {
      await updateInsumo(editOpen.id, {
        nome,
        categoria: editCategoria,
        unidade,
        custoUnit: pc,
        precoVenda,
        stockMinimo: sm,
        fornecedor: editFornecedor.trim() || null,
        marca: editMarca.trim() || null,
        notas: editNotas.trim() || undefined,
        activo: editActivo,
      });
      setEditOpen(null);
      await refresh();
    } catch (ex) {
      setEditMsg(
        ex instanceof Error ? ex.message : "Não foi possível actualizar.",
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function submitEntrada(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    if (!formInsumoId) {
      setFormMsg("Selecciona um insumo.");
      return;
    }
    const qty = parseDecimalInput(formQty);
    if (!Number.isFinite(qty) || qty < 0.001) {
      setFormMsg("Indica uma quantidade válida (mín. 0,001).");
      return;
    }
    setSubmitBusy(true);
    try {
      await addMovimento(formInsumoId, {
        tipo: "ENTRADA",
        quantidade: qty,
        ...(formNota.trim() ? { nota: formNota.trim() } : {}),
      });
      setFormQty("");
      setFormNota("");
      setFormMsg("Entrada registada com sucesso.");
      setStockOpPanel(null);
      await refresh();
      if (movOpenId === formInsumoId) {
        setMovRows(await listMovimentos(formInsumoId, 50));
      }
    } catch (ex) {
      setFormMsg(
        ex instanceof Error ? ex.message : "Não foi possível registar a entrada.",
      );
    } finally {
      setSubmitBusy(false);
    }
  }

  async function submitSaidaManual(e: React.FormEvent) {
    e.preventDefault();
    setSaidaMsg(null);
    if (!formSaidaInsumoId) {
      setSaidaMsg("Selecciona um insumo.");
      return;
    }
    const qty = parseDecimalInput(formSaidaQty);
    if (!Number.isFinite(qty) || qty < 0.001) {
      setSaidaMsg("Quantidade inválida (mín. 0,001).");
      return;
    }
    setSaidaBusy(true);
    try {
      await addMovimento(formSaidaInsumoId, {
        tipo: "SAIDA_MANUAL",
        quantidade: qty,
        ...(formSaidaNota.trim() ? { nota: formSaidaNota.trim() } : {}),
      });
      setFormSaidaQty("");
      setFormSaidaNota("");
      setSaidaMsg("Saída manual registada.");
      setStockOpPanel(null);
      await refresh();
      if (movOpenId === formSaidaInsumoId) {
        setMovRows(await listMovimentos(formSaidaInsumoId, 50));
      }
    } catch (ex) {
      setSaidaMsg(
        ex instanceof Error ? ex.message : "Não foi possível registar a saída.",
      );
    } finally {
      setSaidaBusy(false);
    }
  }

  async function submitNovoInsumo(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg(null);
    const nome = novoNome.trim();
    if (nome.length < 2) {
      setCreateMsg("Indica um nome com pelo menos 2 caracteres.");
      return;
    }
    const unidade = novoUnidade.trim() || "un";

    let custoUnit = 0;
    if (novoPrecoCompra.trim() !== "") {
      const p = parseDecimalInput(novoPrecoCompra);
      if (!Number.isFinite(p) || p < 0) {
        setCreateMsg("Preço de compra inválido.");
        return;
      }
      custoUnit = p;
    }

    let precoVenda: number | null = null;
    if (novoPrecoVenda.trim() !== "") {
      const p = parseDecimalInput(novoPrecoVenda);
      if (!Number.isFinite(p) || p < 0) {
        setCreateMsg("Preço de venda inválido.");
        return;
      }
      precoVenda = p;
    }

    let stockActual: number | undefined;
    if (novoStockIni.trim() !== "") {
      const s = parseDecimalInput(novoStockIni);
      if (!Number.isFinite(s) || s < 0) {
        setCreateMsg("Stock inicial inválido.");
        return;
      }
      stockActual = s;
    }

    let stockMinimo: number | undefined;
    if (novoStockMin.trim() !== "") {
      const m = parseDecimalInput(novoStockMin);
      if (!Number.isFinite(m) || m < 0) {
        setCreateMsg("Stock mínimo inválido.");
        return;
      }
      stockMinimo = m;
    }

    setCreateBusy(true);
    try {
      const created = await createInsumo({
        nome,
        categoria: novoCategoria,
        unidade,
        custoUnit,
        precoVenda,
        ...(stockActual !== undefined ? { stockActual } : {}),
        ...(stockMinimo !== undefined ? { stockMinimo } : {}),
        ...(novoFornecedor.trim() ? { fornecedor: novoFornecedor.trim() } : {}),
        ...(novoMarca.trim() ? { marca: novoMarca.trim() } : {}),
        ...(novoNotas.trim() ? { notas: novoNotas.trim() } : {}),
      });
      setNovoNome("");
      setNovoCategoria("OUTRO");
      setNovoUnidade("un");
      setNovoPrecoCompra("");
      setNovoPrecoVenda("");
      setNovoStockIni("");
      setNovoStockMin("");
      setNovoFornecedor("");
      setNovoMarca("");
      setNovoNotas("");
      setFormInsumoId(created.id);
      setCreateMsg(`Insumo «${created.nome}» criado. Já pode registar entradas.`);
      setStockOpPanel(null);
      await refresh();
      await loadCatalog();
    } catch (ex) {
      setCreateMsg(
        ex instanceof Error
          ? ex.message
          : "Não foi possível criar o insumo. Verifica permissões (ADMIN).",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleMovimentos(insumoId: string) {
    if (movOpenId === insumoId) {
      setMovOpenId(null);
      setMovRows([]);
      return;
    }
    setMovOpenId(insumoId);
    setMovBusy(true);
    try {
      setMovRows(await listMovimentos(insumoId, 50));
    } catch {
      setMovRows([]);
    } finally {
      setMovBusy(false);
    }
  }

  const insumosActivos = useMemo(
    () => rows.filter((r) => r.activo).length,
    [rows],
  );

  return (
    <div className="space-y-10 p-6 sm:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Armazém
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
          Stock · insumos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Cadastro de materiais, entradas e saídas manuais. O stock desce também com
          pedidos (balcão / produção) conforme as regras de consumo.
        </p>
      </header>

      {/* ——— Resumo e alertas ——— */}
      {dashboard ? (
        <section aria-labelledby="insumos-resumo-heading" className="space-y-6">
          <h2
            id="insumos-resumo-heading"
            className="text-base font-bold text-zinc-900 dark:text-white"
          >
            Resumo do armazém
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div
              className={`${dadivaSurfaceCard} border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-900/80`}
            >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Insumos activos
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
              {dashboard.total}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {insumosActivos} na lista actual
            </p>
            </div>
          <div
            className={`${dadivaSurfaceCard} border-amber-300/50 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/30`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
              Em ou abaixo do mínimo
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-950 dark:text-amber-100">
              {dashboard.alertas.length}
            </p>
            <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/70">
              Com stock mínimo &gt; 0 definido
            </p>
          </div>
          <div
            className={`${dadivaSurfaceCard} border-sky-300/50 bg-sky-50/80 dark:border-sky-500/25 dark:bg-sky-950/25`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200/90">
              Custo total do stock
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
              {formatAoAmount(stockNum(dashboard.custoTotalStock ?? "0"))} AOA
            </p>
            <p className="mt-0.5 text-xs text-sky-900/80 dark:text-sky-200/70">
              Stock × custo unit. (só insumos activos)
            </p>
          </div>
          </div>

          {dashboard && dashboard.alertas.length > 0 ? (
            <div
              className="rounded-2xl border border-amber-400/40 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
              role="status"
            >
              <p className="font-semibold">Stock em ou abaixo do mínimo</p>
              <ul className="mt-2 list-inside list-disc text-xs">
                {dashboard.alertas.map((a) => (
                  <li key={a.id}>
                    {a.nome}: {a.stock_actual} / mín. {a.stock_minimo}{" "}
                    {a.unidade}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="insumos-operacoes-heading" className="space-y-3">
        <div
          className="sticky top-0 z-30 -mx-6 space-y-2 border-b border-zinc-200/90 bg-[#F3F4F6]/92 px-6 py-2.5 pb-3 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.28)] backdrop-blur-md dark:border-zinc-600/50 dark:bg-zinc-900/92 dark:shadow-black/35 sm:-mx-8 sm:px-8"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="insumos-operacoes-heading"
                className="text-sm font-bold text-zinc-900 dark:text-white"
              >
                Operações de stock
              </h2>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                {isAdmin ? (
                  <>
                    Abra o formulário num diálogo (mesmo estilo que registo de
                    cliente ou utilizador). Voltar a clicar na mesma acção fecha o
                    diálogo.
                  </>
                ) : (
                  <>
                    O stock é actualizado automaticamente com pedidos e vendas.
                    Entrada, saída manual e novos insumos são apenas para
                    administradores.
                  </>
                )}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div
              className="flex flex-col gap-2"
              aria-label="Operações de stock rápidas"
            >
              <div className="flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-100/95 via-white to-amber-50/30 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-zinc-600/85 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <button
                  type="button"
                  aria-pressed={stockOpPanel === "entrada"}
                  onClick={() =>
                    setStockOpPanel((p) => (p === "entrada" ? null : "entrada"))
                  }
                  className={`relative flex min-h-[2.5rem] min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 motion-reduce:transition-none sm:min-w-0 ${
                    stockOpPanel === "entrada"
                      ? "scale-[1.02] bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-zinc-950 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.65)] ring-2 ring-amber-300/90 dark:from-amber-500 dark:via-orange-500 dark:to-orange-600 dark:text-black dark:ring-amber-400/40"
                      : "border border-transparent text-zinc-600 hover:border-zinc-200/80 hover:bg-white/70 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/10 text-[10px] dark:bg-white/15"
                    aria-hidden
                  >
                    ↓
                  </span>
                  Entrada
                </button>
                <button
                  type="button"
                  aria-pressed={stockOpPanel === "saida"}
                  onClick={() =>
                    setStockOpPanel((p) => (p === "saida" ? null : "saida"))
                  }
                  className={`relative flex min-h-[2.5rem] min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 motion-reduce:transition-none sm:min-w-0 ${
                    stockOpPanel === "saida"
                      ? "scale-[1.02] border border-red-400/40 bg-gradient-to-br from-red-600 to-red-700 text-white shadow-[0_8px_24px_-8px_rgba(220,38,38,0.55)] ring-2 ring-red-400/50"
                      : "border border-transparent text-zinc-600 hover:border-zinc-200/80 hover:bg-white/70 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/15 text-[10px]"
                    aria-hidden
                  >
                    ↑
                  </span>
                  Saída manual
                </button>
                <button
                  type="button"
                  aria-pressed={stockOpPanel === "novo"}
                  onClick={() =>
                    setStockOpPanel((p) => (p === "novo" ? null : "novo"))
                  }
                  className={`relative flex min-h-[2.5rem] min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 motion-reduce:transition-none sm:min-w-0 ${
                    stockOpPanel === "novo"
                      ? "scale-[1.02] bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-600 text-white shadow-[0_8px_24px_-10px_rgba(139,92,246,0.6)] ring-2 ring-violet-400/55"
                      : "border border-transparent text-zinc-600 hover:border-zinc-200/80 hover:bg-white/70 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/15 text-[10px]"
                    aria-hidden
                  >
                    +
                  </span>
                  Novo insumo
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {isAdmin && stockOpPanel === "entrada" ? (
          <StockOperationModal
            title="Entrada de stock"
            onClose={() => setStockOpPanel(null)}
            busy={submitBusy}
          >
            <p className="text-sm leading-snug text-zinc-400">
              Reposição ou compra — aumenta o stock actual.
            </p>
            <form
              onSubmit={(e) => void submitEntrada(e)}
              className="mt-5 flex flex-col gap-5"
            >
              <div>
                <label className={stockModalLabel} htmlFor="insumo-entrada">
                  Insumo
                </label>
                <p className="mb-2 text-xs leading-snug text-zinc-500">
                  Pesquise ou escolha na lista.
                </p>
                <InsumoEntradaPicker
                  id="insumo-entrada"
                  value={formInsumoId}
                  onChange={setFormInsumoId}
                  rows={rows}
                  disabled={submitBusy || loadState === "loading"}
                  compact
                  variant="modal"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-5">
                <div>
                  <label className={stockModalLabel} htmlFor="qty-entrada">
                    Quantidade
                  </label>
                  <input
                    id="qty-entrada"
                    inputMode="decimal"
                    value={formQty}
                    onChange={(e) =>
                      setFormQty(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          STOCK_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="ex.: 10 ou 2,5"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="nota-entrada">
                    Nota (opcional)
                  </label>
                  <input
                    id="nota-entrada"
                    value={formNota}
                    onChange={(e) => setFormNota(e.target.value)}
                    className={`${stockModalInput} w-full`}
                    placeholder="ex.: Factura FV 2026/123"
                    maxLength={500}
                  />
                </div>
              </div>
              {formMsg ? (
                <p
                  className={`text-sm font-medium ${
                    formMsg.includes("sucesso")
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {formMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={submitBusy}
                  onClick={() => setStockOpPanel(null)}
                  className={stockModalBtnGhost}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitBusy || loadState === "loading"}
                  className={stockModalBtnPrimary}
                >
                  {submitBusy ? "A gravar…" : "Registar entrada"}
                </button>
              </div>
            </form>
          </StockOperationModal>
        ) : null}

        {isAdmin && stockOpPanel === "saida" ? (
          <StockOperationModal
            title="Saída manual"
            onClose={() => setStockOpPanel(null)}
            busy={saidaBusy}
          >
            <p className="text-sm leading-snug text-zinc-400">
              Perda, ajuste ou consumo fora de pedido. Não pode exceder o stock
              disponível.
            </p>
            <form
              onSubmit={(e) => void submitSaidaManual(e)}
              className="mt-5 flex flex-col gap-5"
            >
              <div>
                <label className={stockModalLabel} htmlFor="insumo-saida">
                  Insumo
                </label>
                <p className="mb-2 text-xs leading-snug text-zinc-500">
                  Pesquise ou escolha na lista.
                </p>
                <InsumoEntradaPicker
                  id="insumo-saida"
                  value={formSaidaInsumoId}
                  onChange={setFormSaidaInsumoId}
                  rows={rows}
                  disabled={saidaBusy || loadState === "loading"}
                  compact
                  variant="modal"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-5">
                <div>
                  <label className={stockModalLabel} htmlFor="qty-saida">
                    Quantidade a retirar
                  </label>
                  <input
                    id="qty-saida"
                    inputMode="decimal"
                    value={formSaidaQty}
                    onChange={(e) =>
                      setFormSaidaQty(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          STOCK_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="mín. 0,001"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="nota-saida">
                    Motivo / nota (recomendado)
                  </label>
                  <input
                    id="nota-saida"
                    value={formSaidaNota}
                    onChange={(e) => setFormSaidaNota(e.target.value)}
                    className={`${stockModalInput} w-full`}
                    placeholder="ex.: Ajuste inventário, danos…"
                    maxLength={500}
                  />
                </div>
              </div>
              {saidaMsg ? (
                <p
                  className={`text-sm font-medium ${
                    saidaMsg.includes("registada")
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {saidaMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={saidaBusy}
                  onClick={() => setStockOpPanel(null)}
                  className={stockModalBtnGhost}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saidaBusy || loadState === "loading"}
                  className={stockModalBtnDanger}
                >
                  {saidaBusy ? "A gravar…" : "Registar saída"}
                </button>
              </div>
            </form>
          </StockOperationModal>
        ) : null}

        {isAdmin && stockOpPanel === "novo" ? (
          <StockOperationModal
            title="Novo insumo"
            size="2xl"
            onClose={() => setStockOpPanel(null)}
            busy={createBusy}
          >
            <p className="text-sm leading-snug text-zinc-400">
              Preencha os dados comercial e de stock. Use «+ Novo» para
              acrescentar categoria, unidade ou marca às listas.
            </p>
            <form
              onSubmit={(e) => void submitNovoInsumo(e)}
              className="mt-5 flex flex-col gap-5"
            >
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-5">
                <div className="sm:col-span-2">
                  <label className={stockModalLabel} htmlFor="insumo-nome">
                    Nome <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="insumo-nome"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    className={`${stockModalInput} w-full`}
                    placeholder="ex.: Vinil PU branco mate"
                    maxLength={240}
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Categoria"
                    htmlFor="insumo-cat"
                    options={catalogCategorias}
                    value={novoCategoria}
                    onChange={setNovoCategoria}
                    kind="categoria"
                    reloadCatalog={loadCatalog}
                    disabled={createBusy || loadState === "loading"}
                    variant="modal"
                  />
                </div>
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Unidade"
                    htmlFor="insumo-un"
                    options={catalogUnidades}
                    value={novoUnidade}
                    onChange={setNovoUnidade}
                    kind="unidade"
                    reloadCatalog={loadCatalog}
                    disabled={createBusy || loadState === "loading"}
                    variant="modal"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="insumo-preco-compra">
                    Preço de compra (AOA, opcional)
                  </label>
                  <input
                    id="insumo-preco-compra"
                    inputMode="decimal"
                    value={novoPrecoCompra}
                    onChange={(e) =>
                      setNovoPrecoCompra(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          MONEY_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="vazio = 0"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="insumo-preco-venda">
                    Preço de venda (AOA, opcional)
                  </label>
                  <input
                    id="insumo-preco-venda"
                    inputMode="decimal"
                    value={novoPrecoVenda}
                    onChange={(e) =>
                      setNovoPrecoVenda(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          MONEY_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="referência PDV / balcão"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={stockModalLabel}>
                    Margem de lucro (cálculo automático)
                  </span>
                  <div
                    className="rounded-xl border border-zinc-600/40 bg-zinc-950/50 px-3 py-2.5 text-sm text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    aria-live="polite"
                  >
                    {novoLucroMargem.kind === "ok" ? (
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1">
                        <span
                          className={
                            novoLucroMargem.lucro >= 0
                              ? "font-semibold text-emerald-300"
                              : "font-semibold text-red-400"
                          }
                        >
                          Lucro unitário: {formatAoAmount(novoLucroMargem.lucro)}{" "}
                          AOA
                        </span>
                        <span className="text-zinc-300">
                          Margem sobre custo:{" "}
                          <strong className="tabular-nums">
                            {formatAoAmount(novoLucroMargem.margemSobreCusto)}%
                          </strong>
                        </span>
                        <span className="text-zinc-400">
                          Margem sobre venda:{" "}
                          <strong className="tabular-nums text-zinc-200">
                            {formatAoAmount(novoLucroMargem.margemSobreVenda)}%
                          </strong>
                        </span>
                      </div>
                    ) : (
                      <p
                        className={
                          novoLucroMargem.kind === "bad"
                            ? "text-red-400"
                            : "text-zinc-400"
                        }
                      >
                        {novoLucroMargem.text}
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
                      Sobre custo: (venda − compra) ÷ compra × 100. Sobre venda:
                      (venda − compra) ÷ venda × 100.
                    </p>
                  </div>
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="insumo-stock0">
                    Stock inicial (opcional)
                  </label>
                  <input
                    id="insumo-stock0"
                    inputMode="decimal"
                    value={novoStockIni}
                    onChange={(e) =>
                      setNovoStockIni(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          STOCK_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="vazio = 0"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="insumo-stockmin">
                    Stock mínimo alerta (opcional)
                  </label>
                  <input
                    id="insumo-stockmin"
                    inputMode="decimal"
                    value={novoStockMin}
                    onChange={(e) =>
                      setNovoStockMin(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          STOCK_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={`${stockModalInput} w-full`}
                    placeholder="ex.: 5"
                  />
                </div>
                <div>
                  <label className={stockModalLabel} htmlFor="insumo-fornecedor">
                    Fornecedor (opcional)
                  </label>
                  <input
                    id="insumo-fornecedor"
                    value={novoFornecedor}
                    onChange={(e) => setNovoFornecedor(e.target.value)}
                    className={`${stockModalInput} w-full`}
                    placeholder="Nome do fornecedor"
                    maxLength={120}
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Marca (opcional)"
                    htmlFor="insumo-marca"
                    options={catalogMarcas}
                    value={novoMarca}
                    onChange={setNovoMarca}
                    kind="marca"
                    reloadCatalog={loadCatalog}
                    disabled={createBusy || loadState === "loading"}
                    allowEmpty
                    emptyLabel="— Sem marca —"
                    variant="modal"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={stockModalLabel} htmlFor="insumo-notas">
                    Notas internas (opcional)
                  </label>
                  <textarea
                    id="insumo-notas"
                    value={novoNotas}
                    onChange={(e) => setNovoNotas(e.target.value)}
                    rows={2}
                    className={`${stockModalInput} min-h-[72px] w-full`}
                    maxLength={2000}
                    placeholder="Referência interna, SKU…"
                  />
                </div>
              </div>
              {createMsg ? (
                <p
                  className={`text-sm font-medium ${
                    createMsg.startsWith("Insumo")
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {createMsg}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={createBusy}
                  onClick={() => setStockOpPanel(null)}
                  className={stockModalBtnGhost}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createBusy || loadState === "loading"}
                  className={stockModalBtnViolet}
                >
                  {createBusy ? "A criar…" : "Criar insumo"}
                </button>
              </div>
            </form>
          </StockOperationModal>
        ) : null}
      </section>


      {/* ——— Lista de insumos (filtros + tabela) ——— */}
      <section aria-labelledby="insumos-lista-heading" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="insumos-lista-heading"
              className="text-base font-bold text-zinc-900 dark:text-white"
            >
              Inventário
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pesquisa, filtros e stock actual. Entrada, saída e novo insumo abrem-se
              em diálogo a partir dos botões acima.
            </p>
          </div>
        </div>

        <div
          className={`${dadivaSurfaceCard} flex flex-wrap items-end gap-3 border-zinc-200/80 dark:border-zinc-700`}
        >
          <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-zinc-400"
            />
            Inactivos
          </label>
          <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1">
            <span className={dadivaLabel}>Pesquisar</span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Nome ou categoria…"
              className={dadivaInput}
            />
          </div>
          <div className="flex min-w-[9rem] flex-col gap-1">
            <span className={dadivaLabel}>Categoria</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`${dadivaInput} w-full`}
            >
              <option value="">Todas</option>
              {categoryFilterOptions.map((c) => (
                <option key={c} value={c}>
                  {categoriaLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[11rem] flex-col gap-1">
            <span className={dadivaLabel}>Ordenar</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={`${dadivaInput} w-full`}
            >
              <option value="alert_first">Alertas primeiro</option>
              <option value="nome">Nome (A–Z)</option>
              <option value="categoria">Categoria</option>
              <option value="stock_desc">Stock (maior)</option>
              <option value="stock_asc">Stock (menor)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Actualizar lista
          </button>
        </div>

        {loadState === "error" && err ? (
          <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
        ) : null}

        {loadState === "loading" && rows.length === 0 ? (
          <p className="text-sm text-zinc-500">A carregar…</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
            <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80">
                <th className="px-4 py-3 font-semibold">Insumo</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold text-right">Stock</th>
                <th className="px-4 py-3 font-semibold text-right">Mínimo</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Mov.</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => {
                const low =
                  r.activo &&
                  stockNum(r.stockMinimo) > 0 &&
                  stockNum(r.stockActual) <= stockNum(r.stockMinimo);
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-b border-zinc-100 dark:border-zinc-800 ${
                        !r.activo ? "opacity-60" : ""
                      } ${low ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                        {r.nome}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {categoriaLabel(r.categoria)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {stockNum(r.stockActual)} {r.unidade}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                        {stockNum(r.stockMinimo)} {r.unidade}
                      </td>
                      <td className="px-4 py-3">
                        {r.activo ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Activo
                          </span>
                        ) : (
                          <span className="text-zinc-500">Inactivo</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-zinc-500">
                        {r._count?.movimentos ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="text-xs font-bold text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
                            >
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void toggleMovimentos(r.id)}
                            className="text-xs font-bold text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                          >
                            {movOpenId === r.id ? "Fechar" : "Movimentos"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {movOpenId === r.id ? (
                      <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                        <td colSpan={7} className="px-4 py-4">
                          {movBusy ? (
                            <p className="text-xs text-zinc-500">A carregar…</p>
                          ) : movRows.length === 0 ? (
                            <p className="text-xs text-zinc-500">
                              Sem movimentos recentes.
                            </p>
                          ) : (
                            <ul className="space-y-2 text-xs">
                              {movRows.map((m) => (
                                <li
                                  key={m.id}
                                  className="flex flex-wrap gap-x-3 gap-y-1 border-b border-zinc-200/80 pb-2 dark:border-zinc-800"
                                >
                                  <span className="font-semibold">
                                    {MOV_LABEL[m.tipo] ?? m.tipo}
                                  </span>
                                  <span className="tabular-nums">
                                    {m.quantidade} {r.unidade}
                                  </span>
                                  {m.user?.name ? (
                                    <span className="text-zinc-600">
                                      · {m.user.name}
                                    </span>
                                  ) : null}
                                  {m.order?.orderNumber ? (
                                    <span className="text-amber-700/90 dark:text-amber-400/80">
                                      · Ped. {m.order.orderNumber}
                                    </span>
                                  ) : null}
                                  {m.nota ? (
                                    <span className="text-zinc-600">{m.nota}</span>
                                  ) : null}
                                  <span className="text-zinc-400">
                                    {new Date(m.createdAt).toLocaleString("pt-AO")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredSorted.length === 0 && loadState !== "loading" ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              Nenhum insumo encontrado.
            </p>
          ) : null}
        </div>
        )}
      </section>

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-insumo-title"
        >
          <div
            className={`${dadivaSurfaceCard} max-h-[90vh] w-full max-w-2xl overflow-y-auto border-zinc-200 shadow-2xl dark:border-zinc-600`}
          >
            <h2
              id="edit-insumo-title"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              Editar insumo
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Stock actual:{" "}
              <strong className="text-zinc-800 dark:text-zinc-200">
                {stockNum(editOpen.stockActual)} {editOpen.unidade}
              </strong>{" "}
              — altera apenas com entradas ou saídas.
            </p>
            <form onSubmit={(e) => void submitEdit(e)} className="mt-4 space-y-3">
              <div>
                <label className={dadivaLabel} htmlFor="edit-nome">
                  Nome
                </label>
                <input
                  id="edit-nome"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className={dadivaInput}
                  maxLength={240}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Categoria"
                    htmlFor="edit-cat"
                    options={catalogCategorias}
                    value={editCategoria}
                    onChange={setEditCategoria}
                    kind="categoria"
                    reloadCatalog={loadCatalog}
                    disabled={editBusy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Unidade"
                    htmlFor="edit-un"
                    options={catalogUnidades}
                    value={editUnidade}
                    onChange={setEditUnidade}
                    kind="unidade"
                    reloadCatalog={loadCatalog}
                    disabled={editBusy}
                  />
                </div>
                <div>
                  <label className={dadivaLabel} htmlFor="edit-preco-compra">
                    Preço de compra (AOA)
                  </label>
                  <input
                    id="edit-preco-compra"
                    inputMode="decimal"
                    value={editPrecoCompra}
                    onChange={(e) =>
                      setEditPrecoCompra(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          MONEY_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={dadivaInput}
                  />
                </div>
                <div>
                  <label className={dadivaLabel} htmlFor="edit-preco-venda">
                    Preço de venda (AOA, opcional)
                  </label>
                  <input
                    id="edit-preco-venda"
                    inputMode="decimal"
                    value={editPrecoVenda}
                    onChange={(e) =>
                      setEditPrecoVenda(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          MONEY_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={dadivaInput}
                    placeholder="vazio = sem preço de venda"
                  />
                </div>
                <div>
                  <label className={dadivaLabel} htmlFor="edit-min">
                    Stock mínimo (alerta)
                  </label>
                  <input
                    id="edit-min"
                    inputMode="decimal"
                    value={editStockMin}
                    onChange={(e) =>
                      setEditStockMin(
                        sanitizeUnsignedDecimalString(
                          e.target.value,
                          STOCK_DECIMAL_PLACES,
                        ),
                      )
                    }
                    className={dadivaInput}
                  />
                </div>
                <div>
                  <label className={dadivaLabel} htmlFor="edit-fornecedor">
                    Fornecedor
                  </label>
                  <input
                    id="edit-fornecedor"
                    value={editFornecedor}
                    onChange={(e) => setEditFornecedor(e.target.value)}
                    className={dadivaInput}
                    maxLength={120}
                    placeholder="Opcional"
                  />
                </div>
                <div className="sm:col-span-2">
                  <CatalogSelectWithAdd
                    label="Marca"
                    htmlFor="edit-marca"
                    options={catalogMarcas}
                    value={editMarca}
                    onChange={setEditMarca}
                    kind="marca"
                    reloadCatalog={loadCatalog}
                    disabled={editBusy}
                    allowEmpty
                    emptyLabel="— Sem marca —"
                  />
                </div>
              </div>
              <div>
                <label className={dadivaLabel} htmlFor="edit-notas">
                  Notas
                </label>
                <textarea
                  id="edit-notas"
                  value={editNotas}
                  onChange={(e) => setEditNotas(e.target.value)}
                  rows={2}
                  className={`${dadivaInput} min-h-[72px]`}
                  maxLength={2000}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={editActivo}
                  onChange={(e) => setEditActivo(e.target.checked)}
                  className="rounded border-zinc-400"
                />
                Insumo activo (inactivos não aparecem no PDV nem em listagens por defeito)
              </label>
              {editMsg ? (
                <p className="text-sm text-red-600 dark:text-red-400">{editMsg}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {editBusy ? "A guardar…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(null)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
