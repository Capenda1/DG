"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type MobileEditLayer = {
  id: string;
  kind: "text" | "image";
  scale: number;
  rotationDeg: number;
  widthRel?: number;
  fontSize?: number;
  locked?: boolean;
  name?: string;
  text?: string;
};

export type ModelagemMobileEditSheetProps = {
  layer: MobileEditLayer;
  readOnly?: boolean;
  canUndo: boolean;
  onPatch: (patch: {
    scale?: number;
    rotationDeg?: number;
    widthRel?: number;
    fontSize?: number;
  }) => void;
  onRemove: () => void;
  onUndo: () => void;
  onClose: () => void;
  /** Altura ocupada pelo sheet (para o pai reservar espaço no mockup). */
  onOccupiedHeightChange?: (px: number) => void;
};

const PEEK_H = 64;
const EXPANDED_H = 320;

type DragSession = {
  pointerId: number;
  startY: number;
  startOffset: number;
};

/**
 * Bottom sheet arrastável: começa recolhido (só barra) para não cobrir o modelo.
 * Arrasta para cima = controlos; para baixo = ver o mockup.
 */
export function ModelagemMobileEditSheet({
  layer,
  readOnly = false,
  canUndo,
  onPatch,
  onRemove,
  onUndo,
  onClose,
  onOccupiedHeightChange,
}: ModelagemMobileEditSheetProps) {
  /** 0 = expandido, EXPANDED_H - PEEK_H = só peek visível */
  const maxHide = EXPANDED_H - PEEK_H;
  const [offset, setOffset] = useState(maxHide); // começa recolhido
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(offset);
  const dragRef = useRef<DragSession | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  offsetRef.current = offset;

  const title =
    layer.kind === "text"
      ? (layer.text?.trim().slice(0, 28) || "Texto")
      : (layer.name?.trim() || "Imagem");

  const sizeLabel = layer.kind === "image" ? "Tamanho" : "Tamanho do texto";
  const sizeValue =
    layer.kind === "image"
      ? Math.round((layer.widthRel ?? 0.4) * 100)
      : Math.round(layer.fontSize ?? 36);
  const sizeMin = layer.kind === "image" ? 10 : 6;
  const sizeMax = layer.kind === "image" ? 95 : 150;

  const visibleH = EXPANDED_H - offset;
  const expanded = offset < maxHide * 0.45;

  useEffect(() => {
    onOccupiedHeightChange?.(Math.max(PEEK_H, Math.round(visibleH)));
  }, [visibleH, onOccupiedHeightChange]);

  useEffect(() => {
    return () => onOccupiedHeightChange?.(0);
  }, [onOccupiedHeightChange]);

  /* Nova camada → volta ao peek para ver o modelo */
  useEffect(() => {
    setOffset(maxHide);
  }, [layer.id, maxHide]);

  const snap = useCallback((value: number, velocityY: number) => {
    const mid = maxHide / 2;
    if (velocityY > 0.6) return maxHide; // flick para baixo → recolhe
    if (velocityY < -0.6) return 0; // flick para cima → abre
    return value > mid ? maxHide : 0;
  }, [maxHide]);

  const onHandlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startOffset: offsetRef.current,
    };
    setDragging(true);
  }, []);

  const onHandlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    const next = Math.max(0, Math.min(maxHide, d.startOffset + dy));
    setOffset(next);
  }, [maxHide]);

  const lastMoveRef = useRef<{ y: number; t: number }>({ y: 0, t: 0 });
  const velocityRef = useRef(0);

  const onHandlePointerMoveTracked = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    const prev = lastMoveRef.current;
    if (prev.t > 0) {
      const dt = Math.max(1, now - prev.t);
      velocityRef.current = (e.clientY - prev.y) / dt; // px/ms
    }
    lastMoveRef.current = { y: e.clientY, t: now };
    onHandlePointerMove(e);
  }, [onHandlePointerMove]);

  const onHandlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setOffset((cur) => snap(cur, velocityRef.current));
    velocityRef.current = 0;
    lastMoveRef.current = { y: 0, t: 0 };
  }, [snap]);

  return (
    <div
      ref={sheetRef}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 will-change-transform"
      style={{
        height: EXPANDED_H,
        transform: `translateY(${offset}px)`,
        transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1)",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-label="Editar camada"
      aria-expanded={expanded}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* Pega de arrastar */}
        <div
          className="touch-none shrink-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMoveTracked}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="flex flex-col items-center pt-2">
            <div className="h-1 w-10 rounded-full bg-zinc-500/90" />
            <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
              {expanded ? "Arrasta para baixo · ver modelo" : "Arrasta para cima · editar"}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{title}</p>
              {!expanded ? (
                <p className="text-[10px] text-zinc-500">Mockup livre · toca e arrasta a barra</p>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  1 dedo mover · 2 dedos escala/rotação
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOffset((o) => (o < maxHide / 2 ? maxHide : 0))}
                className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-700/50 px-2 text-[10px] font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                aria-label={expanded ? "Recolher painel" : "Expandir painel"}
              >
                {expanded ? "Ver" : "Editar"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700/50 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                aria-label="Fechar"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Controlos — só relevantes quando expandido */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-1"
          style={{ opacity: expanded ? 1 : 0.35, pointerEvents: expanded ? "auto" : "none" }}
        >
          <fieldset
            disabled={readOnly || layer.locked}
            className="m-0 space-y-3 border-0 p-0 disabled:pointer-events-none disabled:opacity-50"
          >
            <label className="block">
              <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                <span>{sizeLabel}</span>
                <span className="tabular-nums text-zinc-300">
                  {sizeValue}
                  {layer.kind === "image" ? "%" : "px"}
                </span>
              </div>
              <input
                type="range"
                min={sizeMin}
                max={sizeMax}
                value={sizeValue}
                onChange={(e) => {
                  const v = +e.target.value;
                  if (layer.kind === "image") onPatch({ widthRel: v / 100 });
                  else onPatch({ fontSize: v });
                }}
                className="h-11 w-full accent-amber-400"
              />
            </label>

            <label className="block">
              <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Rotação</span>
                <span className="tabular-nums text-zinc-300">{Math.round(layer.rotationDeg)}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                value={Math.round(layer.rotationDeg)}
                onChange={(e) => onPatch({ rotationDeg: +e.target.value })}
                className="h-11 w-full accent-amber-400"
              />
            </label>

            {layer.kind === "image" ? (
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Escala extra</span>
                  <span className="tabular-nums text-zinc-300">{layer.scale.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={400}
                  value={Math.round(layer.scale * 100)}
                  onChange={(e) => onPatch({ scale: +e.target.value / 100 })}
                  className="h-11 w-full accent-amber-400"
                />
              </label>
            ) : null}
          </fieldset>

          <div className="mt-3 grid grid-cols-2 gap-2 pb-2">
            <button
              type="button"
              disabled={!canUndo || readOnly}
              onClick={onUndo}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-zinc-700/50 bg-zinc-900/80 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Desfazer
            </button>
            <button
              type="button"
              disabled={readOnly || layer.locked}
              onClick={onRemove}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/40 text-xs font-semibold text-red-300 transition hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apagar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
