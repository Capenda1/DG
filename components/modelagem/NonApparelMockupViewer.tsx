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
import {
  angleDeg,
  canvasBufferSize,
  clamp01,
  clampScale,
  DESKTOP_HIT_MIN_PX,
  dist,
  getCanvasDpr,
  midpoint,
  normalizeRotation,
  TOUCH_HIT_MIN_PX,
  type ActiveGesture,
  type LayerTransformPatch,
  type Point,
} from "@/components/modelagem/modelagem-touch-gestures";

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
  onTransformLayer?: (id: string, patch: LayerTransformPatch) => void;
  onSelectLayer?: (id: string) => void;
  selectedId?: string | null;
  selectedLayerLabel?: string;
  activeSide?: "front" | "back";
  onSideChange?: (side: "front" | "back") => void;
  touchFriendly?: boolean;
};

type CanvasSize = { w: number; h: number; dpr: number };

function layerBounds(layer: DraggableLayer, W: number, H: number, hitMinPx: number, dpr = 1) {
  const { artSize, artX, artY, artScale } = artLayout(W, H);
  const cx = artX + layer.x * artSize;
  const cy = artY + layer.y * artSize;
  let hw: number;
  let hh: number;
  if (layer.kind === "text") {
    const lines = (layer.text ?? "T").split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length), 1);
    const fs = (layer.fontSize ?? 40) * layer.scale * artScale;
    hw = fs * maxLen * 0.32 + 12 * dpr;
    hh = fs * lines.length * 0.64 + 12 * dpr;
  } else {
    const dw = (layer.widthRel ?? 0.4) * ART_CANVAS_SIZE * layer.scale * artScale;
    hw = dw / 2 + 10 * dpr;
    hh = dw / (layer.aspect ?? 1) / 2 + 10 * dpr;
  }
  const halfMin = hitMinPx / 2;
  return { cx, cy, hw: Math.max(hw, halfMin), hh: Math.max(hh, halfMin) };
}

function hitTest(
  cx: number,
  cy: number,
  layers: DraggableLayer[],
  W: number,
  H: number,
  hitMinPx: number,
  dpr = 1,
): string | null {
  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of sorted) {
    const { cx: lx, cy: ly, hw, hh } = layerBounds(layer, W, H, hitMinPx, dpr);
    const angle = -(layer.rotationDeg * Math.PI) / 180;
    const dx = cx - lx;
    const dy = cy - ly;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) return layer.id;
  }
  return null;
}

function toCanvasCoords(e: PointerEvent<HTMLCanvasElement>): Point {
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
    onTransformLayer,
    onSelectLayer,
    selectedId,
    selectedLayerLabel,
    activeSide = "front",
    onSideChange,
    touchFriendly = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(() => ({
    ...canvasBufferSize(800, 600),
  }));
  const [mugImage, setMugImage] = useState<HTMLImageElement | null>(null);
  const [tintedMug, setTintedMug] = useState<HTMLCanvasElement | null>(null);
  const tintedMugRef = useRef<HTMLCanvasElement | null>(null);
  const side = activeSide;

  const gestureRef = useRef<ActiveGesture | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const layersRef = useRef<DraggableLayer[]>([]);
  const hitMinPx =
    (touchFriendly ? TOUCH_HIT_MIN_PX : DESKTOP_HIT_MIN_PX) * canvasSize.dpr;
  const hitMinRef = useRef(hitMinPx);
  hitMinRef.current = hitMinPx;
  const dprRef = useRef(canvasSize.dpr);
  dprRef.current = canvasSize.dpr;
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

    const applySize = () => {
      const cssW = Math.max(320, Math.round(el.clientWidth));
      const cssH = Math.max(240, Math.round(el.clientHeight));
      const next = canvasBufferSize(cssW, cssH);
      setCanvasSize((prev) =>
        prev.w === next.w && prev.h === next.h && prev.dpr === next.dpr
          ? prev
          : next,
      );
    };

    const ro = new ResizeObserver(applySize);
    ro.observe(el);
    applySize();

    const onDprChange = () => applySize();
    const dprMq = window.matchMedia(`(resolution: ${getCanvasDpr()}dppx)`);
    dprMq.addEventListener?.("change", onDprChange);

    return () => {
      ro.disconnect();
      dprMq.removeEventListener?.("change", onDprChange);
    };
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
      const { cx, cy, hw, hh } = layerBounds(layer, W, H, hitMinPx, canvasSize.dpr);
      const angle = (layer.rotationDeg * Math.PI) / 180;
      const dpr = canvasSize.dpr;
      c2d.save();
      c2d.translate(cx, cy);
      c2d.rotate(angle);
      const color = dragging
        ? "rgba(250,204,21,.95)"
        : isSelected
          ? "rgba(52,211,153,.95)"
          : "rgba(99,210,250,.75)";
      c2d.strokeStyle = color;
      c2d.lineWidth = (isSelected ? 1.8 : 1.4) * dpr;
      c2d.setLineDash(isSelected ? [6 * dpr, 3 * dpr] : [4 * dpr, 3 * dpr]);
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
  }, [hoveredId, isDragging, layers, canvasSize, selectedId, kind, hitMinPx]);

  const beginPinch = useCallback(
    (layerId: string, a: Point, b: Point, ids: [number, number]) => {
      const layer = layersRef.current.find((l) => l.id === layerId);
      if (!layer || layer.locked) return;
      const mid = midpoint(a, b);
      gestureRef.current = {
        mode: "pinch",
        id: layerId,
        pointerIds: ids,
        startDist: Math.max(1, dist(a, b)),
        startAngle: angleDeg(a, b),
        startMidX: mid.x,
        startMidY: mid.y,
        origX: layer.x,
        origY: layer.y,
        origScale: layer.scale,
        origRot: layer.rotationDeg,
        moved: false,
      };
      setHoveredId(layerId);
      setIsDragging(true);
      onDragStart?.(layerId);
    },
    [onDragStart],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (kind !== "MUG" && kind !== "FLAT") return;
      if (e.pointerType === "touch") e.preventDefault();
      const pos = toCanvasCoords(e);
      const W = e.currentTarget.width;
      const H = e.currentTarget.height;
      pointersRef.current.set(e.pointerId, pos);
      e.currentTarget.setPointerCapture(e.pointerId);

      const arr = layersRef.current;
      if (!arr.length) return;

      const pts = [...pointersRef.current.entries()];
      if (pts.length >= 2) {
        const [idA, pA] = pts[0]!;
        const [idB, pB] = pts[1]!;
        const g = gestureRef.current;
        const targetId =
          g?.id ??
          selectedId ??
          hitTest(midpoint(pA, pB).x, midpoint(pA, pB).y, arr, W, H, hitMinRef.current, dprRef.current) ??
          hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current, dprRef.current);
        if (targetId) {
          const layer = arr.find((l) => l.id === targetId);
          if (layer && !layer.locked) {
            beginPinch(targetId, pA, pB, [idA, idB]);
            return;
          }
        }
      }

      const id = hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current, dprRef.current);
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
      gestureRef.current = {
        mode: "drag",
        id,
        pointerId: e.pointerId,
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
    [beginPinch, kind, onDragStart, onSelectLayer, selectedId],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (kind !== "MUG" && kind !== "FLAT") return;
      if (e.pointerType === "touch") e.preventDefault();
      const pos = toCanvasCoords(e);
      const W = e.currentTarget.width;
      const H = e.currentTarget.height;
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, pos);
      }
      const g = gestureRef.current;
      if (!g) {
        const arr = layersRef.current;
        setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current, dprRef.current) : null);
        return;
      }

      const { artSize } = artLayout(W, H);

      if (g.mode === "drag") {
        if (e.pointerId !== g.pointerId) return;
        const dx = (pos.x - g.startX) / artSize;
        const dy = (pos.y - g.startY) / artSize;
        if (!g.moved && (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002)) g.moved = true;
        onMoveLayer?.(g.id, clamp01(g.origX + dx), clamp01(g.origY + dy));
        return;
      }

      const pA = pointersRef.current.get(g.pointerIds[0]);
      const pB = pointersRef.current.get(g.pointerIds[1]);
      if (!pA || !pB) return;
      const d = Math.max(1, dist(pA, pB));
      const scaleFactor = d / g.startDist;
      const rotDelta = angleDeg(pA, pB) - g.startAngle;
      const mid = midpoint(pA, pB);
      const mx = (mid.x - g.startMidX) / artSize;
      const my = (mid.y - g.startMidY) / artSize;
      if (
        !g.moved &&
        (Math.abs(scaleFactor - 1) > 0.02 ||
          Math.abs(rotDelta) > 2 ||
          Math.abs(mx) > 0.002 ||
          Math.abs(my) > 0.002)
      ) {
        g.moved = true;
      }
      onTransformLayer?.(g.id, {
        x: clamp01(g.origX + mx),
        y: clamp01(g.origY + my),
        scale: clampScale(g.origScale * scaleFactor),
        rotationDeg: normalizeRotation(g.origRot + rotDelta),
      });
    },
    [kind, onMoveLayer, onTransformLayer],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      pointersRef.current.delete(e.pointerId);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const g = gestureRef.current;
      const remaining = [...pointersRef.current.entries()];

      if (g?.mode === "pinch") {
        if (remaining.length >= 2) {
          const [idA, pA] = remaining[0]!;
          const [idB, pB] = remaining[1]!;
          const layer = layersRef.current.find((l) => l.id === g.id);
          if (layer) {
            const mid = midpoint(pA, pB);
            gestureRef.current = {
              mode: "pinch",
              id: g.id,
              pointerIds: [idA, idB],
              startDist: Math.max(1, dist(pA, pB)),
              startAngle: angleDeg(pA, pB),
              startMidX: mid.x,
              startMidY: mid.y,
              origX: layer.x,
              origY: layer.y,
              origScale: layer.scale,
              origRot: layer.rotationDeg,
              moved: true,
            };
            return;
          }
        }
        if (remaining.length === 1) {
          const [pid, p] = remaining[0]!;
          const layer = layersRef.current.find((l) => l.id === g.id);
          if (layer) {
            gestureRef.current = {
              mode: "drag",
              id: g.id,
              pointerId: pid,
              startX: p.x,
              startY: p.y,
              origX: layer.x,
              origY: layer.y,
              moved: true,
            };
            return;
          }
        }
        gestureRef.current = null;
        setIsDragging(false);
        return;
      }

      if (g?.mode === "drag" && e.pointerId === g.pointerId) {
        const moved = g.moved;
        const id = g.id;
        gestureRef.current = null;
        setIsDragging(false);
        if (kind !== "MUG" && kind !== "FLAT") return;
        const pos = toCanvasCoords(e);
        const W = e.currentTarget.width;
        const H = e.currentTarget.height;
        const arr = layersRef.current;
        setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current, dprRef.current) : null);
        if (!moved) onSelectLayer?.(id);
        return;
      }

      if (!remaining.length) {
        gestureRef.current = null;
        setIsDragging(false);
      }
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
          className={`absolute inset-0 h-full w-full touch-none ${cursorClass}`}
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (!gestureRef.current && pointersRef.current.size === 0) setHoveredId(null);
          }}
        />
      ) : null}

      {touchFriendly ? null : (
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
      )}

      {kind === "FLAT" && onSideChange ? (
        <div
          className={`pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-zinc-950/75 p-1 backdrop-blur-md ${
            touchFriendly ? "bottom-2" : "bottom-16"
          }`}
        >
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
          {touchFriendly
            ? "1 dedo: mover · 2 dedos: escala e rotação"
            : kind === "MUG"
              ? "Arrasta texto e imagens para posicionar na área de sublimação."
              : "Posiciona a arte na face activa (frente ou verso)."}
        </p>
      ) : null}
    </div>
  );
});
