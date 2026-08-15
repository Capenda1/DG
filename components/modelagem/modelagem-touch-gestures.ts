/** Hit mínimo generoso para dedo (~44px CSS ≈ alvo acessível). */
export const TOUCH_HIT_MIN_PX = 44;
export const DESKTOP_HIT_MIN_PX = 22;

/**
 * Densidade do ecrã para o buffer do canvas.
 * Sem isto, o canvas usa 1 CSS-pixel = 1 buffer-pixel e fica desfocado em
 * telemóveis (DPR 2–3). Limite 3 evita buffers enormes em ecrãs 4×.
 */
export function getCanvasDpr(max = 3): number {
  if (typeof window === "undefined") return 1;
  const raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(max, raw));
}

/** Buffer interno (w×h) a partir do tamanho CSS do contentor. */
export function canvasBufferSize(cssW: number, cssH: number, dpr = getCanvasDpr()) {
  return {
    w: Math.max(1, Math.round(cssW * dpr)),
    h: Math.max(1, Math.round(cssH * dpr)),
    dpr,
  };
}

export type Point = { x: number; y: number };

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function angleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp01(v: number, lo = 0.01, hi = 0.99): number {
  return Math.max(lo, Math.min(hi, v));
}

export function clampScale(v: number, lo = 0.15, hi = 4): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalizeRotation(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export type LayerTransformPatch = {
  x?: number;
  y?: number;
  scale?: number;
  rotationDeg?: number;
};

export type DragGesture = {
  mode: "drag";
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
};

export type PinchGesture = {
  mode: "pinch";
  id: string;
  pointerIds: [number, number];
  startDist: number;
  startAngle: number;
  startMidX: number;
  startMidY: number;
  origX: number;
  origY: number;
  origScale: number;
  origRot: number;
  moved: boolean;
};

export type ActiveGesture = DragGesture | PinchGesture;
