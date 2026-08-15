"use client";

/**
 * Paleta centrada nas cores primárias (vermelho, amarelo, azul),
 * com secundárias clássicas e neutros essenciais para estampa.
 */
export const MODELAGEM_PALETTE: { hex: string; label: string }[] = [
  /* Neutros */
  { hex: "#ffffff", label: "Branco" },
  { hex: "#f2f2f2", label: "Cinza claro" },
  { hex: "#808080", label: "Cinza" },
  { hex: "#1a1a1a", label: "Preto" },
  /* Primárias */
  { hex: "#e53935", label: "Vermelho" },
  { hex: "#ffeb3b", label: "Amarelo" },
  { hex: "#1e88e5", label: "Azul" },
  /* Primárias saturadas / impressão */
  { hex: "#c62828", label: "Vermelho escuro" },
  { hex: "#fdd835", label: "Amarelo ouro" },
  { hex: "#1565c0", label: "Azul escuro" },
  { hex: "#ff5252", label: "Vermelho claro" },
  { hex: "#fff176", label: "Amarelo claro" },
  { hex: "#64b5f6", label: "Azul claro" },
  /* Secundárias (mistura das primárias) */
  { hex: "#fb8c00", label: "Laranja" },
  { hex: "#43a047", label: "Verde" },
  { hex: "#8e24aa", label: "Roxo" },
  { hex: "#ff9800", label: "Laranja vivo" },
  { hex: "#66bb6a", label: "Verde claro" },
  { hex: "#ab47bc", label: "Roxo claro" },
  { hex: "#0d47a1", label: "Azul marinho" },
  { hex: "#b71c1c", label: "Bordeaux" },
  { hex: "#f9a825", label: "Âmbar" },
];

function normalizeHex(v: string): string {
  const t = (v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : "#ffffff";
}

function isLight(hex: string): boolean {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170;
}

export type ModelagemColorPaletteProps = {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  /** Mostra input nativo para cor personalizada. */
  allowCustom?: boolean;
  disabled?: boolean;
  /** `compact` = desktop; `touch` = grelha ≥44px; `strip` = fila horizontal (telemóvel). */
  density?: "compact" | "touch" | "strip";
  className?: string;
};

export function ModelagemColorPalette({
  value,
  onChange,
  label = "Cor",
  allowCustom = true,
  disabled = false,
  density = "touch",
  className = "",
}: ModelagemColorPaletteProps) {
  const current = normalizeHex(value);
  const strip = density === "strip";
  const touch = density === "touch";
  const inPalette = MODELAGEM_PALETTE.some((c) => c.hex.toLowerCase() === current);
  const swatchSize = strip ? "h-9 w-9 shrink-0" : touch ? "h-11 w-full min-h-11" : "h-7 w-full min-h-7";

  return (
    <div className={className}>
      {!strip ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-[11px] font-medium text-zinc-400">{label}</label>
          <span className="font-mono text-[10px] uppercase tabular-nums text-zinc-500">
            {current}
          </span>
        </div>
      ) : null}

      <div
        className={
          strip
            ? "-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : `grid ${touch ? "grid-cols-6 gap-2" : "grid-cols-8 gap-1.5"}`
        }
        role="listbox"
        aria-label={label}
      >
        {MODELAGEM_PALETTE.map((c) => {
          const selected = c.hex.toLowerCase() === current;
          return (
            <button
              key={c.hex}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={c.label}
              title={c.label}
              disabled={disabled}
              onClick={() => onChange(c.hex)}
              className={`relative touch-manipulation rounded-full border transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${swatchSize} ${
                selected
                  ? "border-white ring-2 ring-amber-400/70 ring-offset-1 ring-offset-zinc-950"
                  : "border-white/15"
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {selected ? (
                <span
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold ${
                    isLight(c.hex) ? "text-zinc-900" : "text-white"
                  }`}
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}

        {allowCustom ? (
          <label
            className={`relative flex cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-zinc-500/60 bg-zinc-900/80 transition ${swatchSize} ${
              !inPalette ? "ring-2 ring-amber-400/40 ring-offset-1 ring-offset-zinc-950" : ""
            } ${disabled ? "pointer-events-none opacity-40" : ""}`}
            title="Cor personalizada"
            aria-label="Cor personalizada"
          >
            <span
              className="absolute inset-0 opacity-90"
              style={{
                background: inPalette
                  ? "linear-gradient(135deg, #e53935, #ffeb3b, #1e88e5, #43a047, #fb8c00, #8e24aa)"
                  : current,
              }}
            />
            <span className="relative z-[1] text-[11px] font-bold text-white drop-shadow">+</span>
            <input
              type="color"
              disabled={disabled}
              value={current}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
