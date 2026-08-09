"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import type { ModelagemPreviewKind } from "@/lib/modelagem-preview";
import {
  drawFlatArtOverlay,
  drawFlatCardMockup,
} from "@/lib/modelagem-flat-preview";
import {
  artLayout,
  ART_CANVAS_SIZE,
  drawStudioBackground,
} from "@/lib/modelagem-canvas-layout";
import {
  drawMockupFinish,
  drawMugArtOverlayFull,
  drawPhotoMug,
  prepareTintedMug,
} from "@/lib/modelagem-mug-preview";
import { modelagemMugImageUrl } from "@/lib/modelagem-model-images";
import type {
  DraggableLayer,
  MockupViewer2DHandle,
} from "@/components/modelagem/MockupViewer2D";

export type NonApparelMockupViewerProps = {
  kind: Extract<ModelagemPreviewKind, "MUG" | "FLAT">;
  artCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawVersion: number;
  baseColorHex?: string;
  flatAspect?: number;
  caption?: string;
  className?: string;
  showFooterHint?: boolean;
  layers?: DraggableLayer[];
  onDragStart?: (id: string) => void;
  onMoveLayer?: (id: string, x: number, y: number) => void;
  onSelectLayer?: (id: string) => void;
  selectedId?: string | null;
  selectedLayerLabel?: string;
  activeSide?: "front" | "back";
  onSideChange?: (side: "front" | "back") => void;
};

type CanvasSize = { w: number; h: number };
type DragState = {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
};

function layerBounds(layer: DraggableLayer, W: number, H: number) {
  const { artSize, artX, artY, artScale } = artLayout(W, H);
  const cx = artX + layer.x * artSize;
  const cy = artY + layer.y * artSize;
  let hw: number;
  let hh: number;
  if (layer.kind === "text") {
    const lines = (layer.text ?? "T").split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length), 1);
    const fs = (layer.fontSize ?? 40) * layer.scale * artScale;
    hw = fs * maxLen * 0.32 + 12;
    hh = fs * lines.length * 0.64 + 12;
  } else {
    const dw = (layer.widthRel ?? 0.4) * ART_CANVAS_SIZE * layer.scale * artScale;
    hw = dw / 2 + 10;
    hh = dw / (layer.aspect ?? 1) / 2 + 10;
  }
  return { cx, cy, hw: Math.max(hw, 22), hh: Math.max(hh, 22) };
}

function hitTest(
  cx: number,
  cy: number,
  layers: DraggableLayer[],
  W: number,
  H: number,
): string | null {
  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of sorted) {
    const { cx: lx, cy: ly, hw, hh } = layerBounds(layer, W, H);
    const angle = -(layer.rotationDeg * Math.PI) / 180;
    const dx = cx - lx;
    const dy = cy - ly;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) return layer.id;
  }
  return null;
}

function toCanvasCoords(e: PointerEvent<HTMLCanvasElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const cw = e.currentTarget.width;
  const ch = e.currentTarget.height;
  return {
    x: ((e.clientX - rect.left) / rect.width) * cw,
    y: ((e.clientY - rect.top) / rect.height) * ch,
  };
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  kind: "MUG" | "FLAT",
  opts: {
    tintedMug: HTMLCanvasElement | null;
    flatAspect: number;
    side: "front" | "back";
    artCanvas: HTMLCanvasElement | null;
  },
): void {
  ctx.clearRect(0, 0, W, H);
  drawStudioBackground(ctx, W, H);

  if (kind === "MUG" && opts.tintedMug) {
    drawPhotoMug(ctx, W, H, opts.tintedMug);
    drawMugArtOverlayFull(ctx, opts.artCanvas, W, H);
    drawMockupFinish(ctx, W, H);
  } else if (kind === "FLAT") {
    drawFlatCardMockup(ctx, W, H, opts.flatAspect, opts.side);
    drawFlatArtOverlay(ctx, opts.artCanvas, W, H);
    drawMockupFinish(ctx, W, H);
  }
}

export const NonApparelMockupViewer = forwardRef<
  MockupViewer2DHandle,
  NonApparelMockupViewerProps
>(function NonApparelMockupViewer(
  {
    kind,
    artCanvasRef,
    drawVersion,
    baseColorHex = "#f2f2f2",
    flatAspect = 90 / 50,
    caption,
    className,
    showFooterHint = true,
    layers,
    onDragStart,
    onMoveLayer,
    onSelectLayer,
    selectedId,
    selectedLayerLabel,
    activeSide = "front",
    onSideChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ w: 800, h: 600 });
  const [mugImage, setMugImage] = useState<HTMLImageElement | null>(null);
  const [tintedMug, setTintedMug] = useState<HTMLCanvasElement | null>(null);
  const tintedMugRef = useRef<HTMLCanvasElement | null>(null);
  const side = activeSide;

  const dragRef = useRef<DragState | null>(null);
  const layersRef = useRef<DraggableLayer[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useLayoutEffect(() => {
    tintedMugRef.current = tintedMug;
  }, [tintedMug]);

  useEffect(() => {
    layersRef.current = layers ?? [];
  }, [layers]);

  useImperativeHandle(ref, () => ({
    getOutputCanvas: () => outRef.current,
    renderSide(targetSide: "front" | "back", artCanvas: HTMLCanvasElement | null) {
      const out = outRef.current;
      if (!out) return null;
      const W = out.width;
      const H = out.height;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      paintFrame(ctx, W, H, kind, {
        tintedMug: tintedMugRef.current,
        flatAspect,
        side: targetSide,
        artCanvas,
      });
      return canvas;
    },
  }));

  useEffect(() => {
    if (kind !== "MUG") return;
    let cancelled = false;
    setMugImage(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setMugImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setMugImage(null);
    };
    img.src = modelagemMugImageUrl();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "MUG" || !mugImage) {
      setTintedMug(null);
      return;
    }
    try {
      setTintedMug(prepareTintedMug(mugImage, baseColorHex));
    } catch {
      setTintedMug(null);
    }
  }, [kind, mugImage, baseColorHex]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, Math.round(el.clientWidth));
      const h = Math.max(240, Math.round(el.clientHeight));
      setCanvasSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const out = outRef.current;
    if (!out) return;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    paintFrame(ctx, out.width, out.height, kind, {
      tintedMug,
      flatAspect,
      side,
      artCanvas: artCanvasRef.current,
    });
  }, [
    artCanvasRef,
    drawVersion,
    kind,
    tintedMug,
    flatAspect,
    side,
    canvasSize,
  ]);

  useEffect(() => {
    const hl = hlRef.current;
    if (!hl || (kind !== "MUG" && kind !== "FLAT")) return;
    const ctx = hl.getContext("2d");
    if (!ctx) return;
    const c2d: CanvasRenderingContext2D = ctx;
    const W = hl.width;
    const H = hl.height;
    c2d.clearRect(0, 0, W, H);

    function drawHandle(layer: DraggableLayer, isSelected: boolean, dragging: boolean) {
      const { cx, cy, hw, hh } = layerBounds(layer, W, H);
      const angle = (layer.rotationDeg * Math.PI) / 180;
      c2d.save();
      c2d.translate(cx, cy);
      c2d.rotate(angle);
      const color = dragging
        ? "rgba(250,204,21,.95)"
        : isSelected
          ? "rgba(52,211,153,.95)"
          : "rgba(99,210,250,.75)";
      c2d.strokeStyle = color;
      c2d.lineWidth = isSelected ? 1.8 : 1.4;
      c2d.setLineDash(isSelected ? [6, 3] : [4, 3]);
      c2d.strokeRect(-hw, -hh, hw * 2, hh * 2);
      c2d.setLineDash([]);
      c2d.restore();
    }

    if (layers?.length) {
      const sel = selectedId ? layers.find((l) => l.id === selectedId) : null;
      const hov =
        hoveredId && hoveredId !== selectedId
          ? layers.find((l) => l.id === hoveredId)
          : null;
      if (sel) drawHandle(sel, true, isDragging && hoveredId === selectedId);
      if (hov) drawHandle(hov, false, false);
    }
  }, [hoveredId, isDragging, layers, canvasSize, selectedId, kind]);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (kind !== "MUG" && kind !== "FLAT") return;
      const pos = toCanvasCoords(e);
      const arr = layersRef.current;
      if (!arr.length) return;
      const id = hitTest(pos.x, pos.y, arr, e.currentTarget.width, e.currentTarget.height);
      if (!id) {
        setHoveredId(null);
        return;
      }
      const layer = arr.find((l) => l.id === id)!;
      if (layer.locked) {
        onSelectLayer?.(layer.id);
        setHoveredId(id);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        id,
        startX: pos.x,
        startY: pos.y,
        origX: layer.x,
        origY: layer.y,
        moved: false,
      };
      setHoveredId(id);
      setIsDragging(true);
      onDragStart?.(id);
    },
    [kind, onDragStart, onSelectLayer],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (kind !== "MUG" && kind !== "FLAT") return;
      const pos = toCanvasCoords(e);
      const W = e.currentTarget.width;
      const H = e.currentTarget.height;
      const drag = dragRef.current;
      if (drag) {
        const { artSize } = artLayout(W, H);
        const dx = (pos.x - drag.startX) / artSize;
        const dy = (pos.y - drag.startY) / artSize;
        if (!drag.moved && (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002)) {
          drag.moved = true;
        }
        onMoveLayer?.(
          drag.id,
          Math.max(0.01, Math.min(0.99, drag.origX + dx)),
          Math.max(0.01, Math.min(0.99, drag.origY + dy)),
        );
      } else {
        const arr = layersRef.current;
        setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H) : null);
      }
    },
    [kind, onMoveLayer],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);
      if (kind !== "MUG" && kind !== "FLAT") return;
      const pos = toCanvasCoords(e);
      const W = e.currentTarget.width;
      const H = e.currentTarget.height;
      const arr = layersRef.current;
      setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H) : null);
      if (drag && !drag.moved) onSelectLayer?.(drag.id);
    },
    [kind, onSelectLayer],
  );

  const cursorClass =
    kind === "MUG" || kind === "FLAT"
      ? isDragging
        ? "cursor-grabbing"
        : hoveredId
          ? "cursor-grab"
          : ""
      : "";

  const shellClass =
    className ?? "relative w-full min-h-[240px] overflow-hidden rounded-2xl";

  return (
    <div ref={containerRef} className={`${shellClass} isolate`}>
      <canvas
        ref={outRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="absolute inset-0 h-full w-full"
      />

      {(kind === "MUG" || kind === "FLAT") ? (
        <canvas
          ref={hlRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className={`absolute inset-0 h-full w-full ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (!dragRef.current) setHoveredId(null);
          }}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#03050a]/90 via-[#03050a]/40 to-transparent px-4 pb-14 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/[0.13] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80 ring-1 ring-emerald-400/20">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Ao vivo
          </span>
          {selectedLayerLabel && (kind === "MUG" || kind === "FLAT") ? (
            <span className="truncate text-[10px] font-medium text-amber-300/85">
              {selectedLayerLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/[0.13] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-300/80 ring-1 ring-indigo-400/20">
            {kind === "MUG" ? "Caneca" : "Impressão plana"}
          </span>
          {caption ? (
            <span className="hidden truncate text-[10px] text-zinc-400 sm:inline">
              {caption}
            </span>
          ) : null}
        </div>
      </div>

      {kind === "FLAT" && onSideChange ? (
        <div className="pointer-events-auto absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-zinc-950/75 p-1 backdrop-blur-md">
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSideChange(s)}
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                side === s
                  ? "bg-indigo-500 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {s === "front" ? "Frente" : "Verso"}
            </button>
          ))}
        </div>
      ) : null}

      {showFooterHint ? (
        <p className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 text-center text-[10px] text-zinc-500/90">
          {kind === "MUG"
            ? "Arrasta texto e imagens para posicionar na área de sublimação."
            : "Posiciona a arte na face activa (frente ou verso)."}
        </p>
      ) : null}
    </div>
  );
});
