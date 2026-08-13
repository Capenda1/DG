"use client";

/* eslint-disable react-hooks/set-state-in-effect -- carregar imagem da peça e pré-calcular frente/costas (pipeline assíncrono) */

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

/** Handle exposto pelo forwardRef para acesso externo ao canvas renderizado. */
export type MockupViewer2DHandle = {
  /** Retorna o canvas de saída com o mockup actual (garment + arte). */
  getOutputCanvas: () => HTMLCanvasElement | null;
  /**
   * Renderiza um lado específico (frente ou costas) numa nova HTMLCanvasElement
   * usando a arte fornecida como overlay. Útil para exportar ambos os lados.
   */
  renderSide: (side: "front" | "back", artCanvas: HTMLCanvasElement | null) => HTMLCanvasElement | null;
};
import type { ApparelProductType } from "@/lib/apparel-catalog";
import {
  garmentStrokeRgba,
  garmentSvgPaths,
} from "@/lib/modelagem-garment-preview";
import { modelagemModelImageUrl } from "@/lib/modelagem-model-images";
import {
  angleDeg,
  clamp01,
  clampScale,
  DESKTOP_HIT_MIN_PX,
  dist,
  midpoint,
  normalizeRotation,
  TOUCH_HIT_MIN_PX,
  type ActiveGesture,
  type LayerTransformPatch,
  type Point,
} from "@/components/modelagem/modelagem-touch-gestures";

/* ─────────────────────────────────────────────────────────────────────────────
 * Tinting fotorrealista: multiply + máscara de luminância.
 * Recebe a metade esquerda da foto (frente da peça), aplica a cor do pedido
 * e remove o fundo branco com base na luminância do pixel original.
 * ───────────────────────────────────────────────────────────────────────────── */
function prepareTintedGarment(
  img: HTMLImageElement,
  colorHex: string,
  side: "front" | "back" = "front",
): HTMLCanvasElement {
  const iw = img.naturalWidth  || img.width;
  const ih = img.naturalHeight || img.height;

  /* Metade esquerda = frente, metade direita = costas */
  const fw   = Math.round(iw / 2);
  const srcX = side === "front" ? 0 : fw;

  const tmp = document.createElement("canvas");
  tmp.width = fw; tmp.height = ih;
  const ctx = tmp.getContext("2d")!;

  /* 1 – Desenhar a vista escolhida */
  ctx.drawImage(img, srcX, 0, fw, ih, 0, 0, fw, ih);

  /* 2 – Guardar luminância original para a máscara */
  const orig = ctx.getImageData(0, 0, fw, ih).data;

  /* 3 – Multiply com a cor do pedido → branco torna-se a cor, sombras escurecem-na */
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, fw, ih);
  ctx.globalCompositeOperation = "source-over";

  /* 4 – Máscara de luminância: pixels quasi-brancos → transparentes */
  const colored = ctx.getImageData(0, 0, fw, ih);
  const d = colored.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = orig[i] * 0.299 + orig[i + 1] * 0.587 + orig[i + 2] * 0.114;
    if (lum > 215) {
      /* Transição suave: 215 → completamente opaco, 250 → completamente transparente */
      d[i + 3] = Math.round(d[i + 3] * Math.max(0, (250 - lum) / 35));
    }
  }
  ctx.putImageData(colored, 0, 0);
  return tmp;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Helpers de layout — recebem W e H reais do canvas responsivo.
 * A arte ocupa ~88% da altura e é centrada horizontalmente.
 * ───────────────────────────────────────────────────────────────────────────── */
const ART_CANVAS_SIZE = 512;
const ART_FACTOR = 0.93;

function artLayout(W: number, H: number) {
  const artSize = H * ART_FACTOR;
  const artX = (W - artSize) / 2;
  const artY = (H - artSize) / 2 - H * 0.015;
  const artScale = artSize / ART_CANVAS_SIZE;
  return { artSize, artX, artY, artScale };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Tipos e hit-test para drag interactivo
 * ───────────────────────────────────────────────────────────────────────────── */
export interface DraggableLayer {
  id: string;
  kind: "text" | "image";
  x: number; y: number;
  scale: number; rotationDeg: number; zIndex: number;
  fontSize?: number; text?: string;
  widthRel?: number; aspect?: number;
  /** Bloqueia arrasto (ex.: modelo do designer com pedido submetido — só leitura para o cliente). */
  locked?: boolean;
}

function layerBounds(layer: DraggableLayer, W: number, H: number, hitMinPx: number) {
  const { artSize, artX, artY, artScale } = artLayout(W, H);
  const cx = artX + layer.x * artSize;
  const cy = artY + layer.y * artSize;
  let hw: number, hh: number;
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
): string | null {
  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of sorted) {
    const { cx: lx, cy: ly, hw, hh } = layerBounds(layer, W, H, hitMinPx);
    const angle = -(layer.rotationDeg * Math.PI) / 180;
    const dx = cx - lx, dy = cy - ly;
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) {
      /* Camadas bloqueadas ainda podem ser clicadas para selecção — mas não entram no hit se houver
       * por cima uma camada desbloqueada (o loop percorre por zIndex decrescente). */
      return layer.id;
    }
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

/* ═══════════════════════════════════════════════════════════════════════════ */


export type MockupViewer2DProps = {
  artCanvasRef: RefObject<HTMLCanvasElement | null>;
  drawVersion: number;
  productType?: ApparelProductType;
  baseColorHex?: string;
  caption?: string;
  className?: string;
  showFooterHint?: boolean;
  layers?: DraggableLayer[];
  onDragStart?: (id: string) => void;
  onMoveLayer?: (id: string, x: number, y: number) => void;
  /** Escala / rotação em tempo real (pinch + rotação com dois dedos). */
  onTransformLayer?: (id: string, patch: LayerTransformPatch) => void;
  onSelectLayer?: (id: string) => void;
  /** Id da camada actualmente seleccionada (para indicador persistente no canvas). */
  selectedId?: string | null;
  /** Etiqueta legível da camada seleccionada (exibida no header). */
  selectedLayerLabel?: string;
  /** Lado activo controlado pelo pai (levantado de state interno). */
  activeSide?: "front" | "back";
  /** Callback quando o utilizador clica no toggle Frente/Costas. */
  onSideChange?: (side: "front" | "back") => void;
  /** Alvos de toque maiores e gestos pinch/rotação optimizados para telemóvel. */
  touchFriendly?: boolean;
};

type CanvasSize = { w: number; h: number };

export const MockupViewer2D = forwardRef<MockupViewer2DHandle, MockupViewer2DProps>(
function MockupViewer2D({
  artCanvasRef, drawVersion,
  productType = "T_SHIRT", baseColorHex = "#c8cdd4",
  caption, className, showFooterHint = true,
  layers, onDragStart, onMoveLayer, onTransformLayer, onSelectLayer,
  selectedId, selectedLayerLabel,
  activeSide: activeSideProp = "front",
  onSideChange,
  touchFriendly = false,
}: MockupViewer2DProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const hlRef  = useRef<HTMLCanvasElement>(null);

  const [garmentImage,  setGarmentImage]  = useState<HTMLImageElement | null>(null);
  const [tintedFront,   setTintedFront]   = useState<HTMLCanvasElement | null>(null);
  const [tintedBack,    setTintedBack]    = useState<HTMLCanvasElement | null>(null);
  /* side é controlado pelo pai via activeSideProp */
  const side = activeSideProp;
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ w: 800, h: 600 });

  /* Refs para o useImperativeHandle aceder sempre aos valores mais recentes sem TDZ */
  const tintedFrontRef = useRef<HTMLCanvasElement | null>(null);
  const tintedBackRef  = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    tintedFrontRef.current = tintedFront;
    tintedBackRef.current = tintedBack;
  }, [tintedFront, tintedBack]);

  useImperativeHandle(ref, () => ({
    getOutputCanvas: () => outRef.current,

    renderSide(targetSide: "front" | "back", artCanvas: HTMLCanvasElement | null): HTMLCanvasElement | null {
      const out = outRef.current;
      if (!out) return null;
      const W = out.width, H = out.height;

      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      /* Fundo estúdio luminoso */
      const bg = ctx.createRadialGradient(W*.5, H*.38, W*.04, W*.5, H*.5, Math.max(W,H)*.95);
      bg.addColorStop(0, "#3a4f6e"); bg.addColorStop(.40, "#263650");
      bg.addColorStop(.75, "#162438"); bg.addColorStop(1, "#0d1828");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const spot = ctx.createRadialGradient(W*.5, -H*.08, W*.03, W*.5, H*.38, H*.85);
      spot.addColorStop(0, "rgba(220,235,255,0.55)"); spot.addColorStop(.25, "rgba(190,215,255,0.30)");
      spot.addColorStop(.55, "rgba(150,185,240,0.10)"); spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);

      const spot2 = ctx.createRadialGradient(W*.15, H*.25, W*.02, W*.25, H*.45, W*.55);
      spot2.addColorStop(0, "rgba(180,210,255,0.14)"); spot2.addColorStop(.5, "rgba(140,175,230,0.05)"); spot2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot2; ctx.fillRect(0, 0, W, H);

      const floor = ctx.createLinearGradient(0, H*.62, 0, H);
      floor.addColorStop(0, "rgba(100,140,220,0)"); floor.addColorStop(.35, "rgba(80,120,200,.10)");
      floor.addColorStop(.70, "rgba(50,85,160,.05)"); floor.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = floor; ctx.fillRect(0, H*.62, W, H*.38);

      const { artSize, artX, artY } = artLayout(W, H);
      const tintedGarment = targetSide === "front" ? tintedFrontRef.current : tintedBackRef.current;

      if (tintedGarment) {
        const fw = tintedGarment.width, fh = tintedGarment.height;
        const scale = Math.min(W/fw, H/fh) * 0.93;
        const dw = fw*scale, dh = fh*scale;
        const dx = (W-dw)/2, dy = (H-dh)/2 - H*0.02;

        const dropShadow = ctx.createRadialGradient(W*.5, dy+dh*.96, W*.01, W*.5, dy+dh*.96, W*.35);
        dropShadow.addColorStop(0, "rgba(0,0,0,0.50)"); dropShadow.addColorStop(0.5, "rgba(0,0,0,0.15)"); dropShadow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = dropShadow; ctx.fillRect(0, dy+dh*.80, W, dh*.25);
        ctx.drawImage(tintedGarment, dx, dy, dw, dh);
      } else {
        /* Fallback SVG (export) */
        const gScale = artSize / 200;
        const paths = garmentSvgPaths(productType);
        const bodyPath = new Path2D(paths.body);
        const lum2 = (function lx(hex: string) {
          const s=hex.replace("#",""); if(s.length!==6) return .5;
          return parseInt(s.slice(0,2),16)/255*.2126+parseInt(s.slice(2,4),16)/255*.7152+parseInt(s.slice(4,6),16)/255*.0722;
        })(baseColorHex);
        const stroke2 = garmentStrokeRgba(baseColorHex);
        ctx.save();
        ctx.translate(artX, artY); ctx.scale(gScale, gScale);
        ctx.fillStyle = baseColorHex; ctx.fill(bodyPath);
        ctx.save(); ctx.clip(bodyPath);
        const tl2 = ctx.createLinearGradient(100,28,100,188);
        tl2.addColorStop(0,"rgba(255,255,255,0.12)"); tl2.addColorStop(.40,"rgba(255,255,255,0)"); tl2.addColorStop(1,"rgba(0,0,0,0.10)");
        ctx.fillStyle=tl2; ctx.fillRect(-5,-5,210,210);
        ctx.restore();
        ctx.strokeStyle=stroke2; ctx.lineWidth=1.4; ctx.lineJoin="round"; ctx.stroke(bodyPath);
        if (paths.collarBand) {
          const cb2=new Path2D(paths.collarBand);
          ctx.fillStyle=baseColorHex; ctx.fill(cb2);
          ctx.fillStyle=lum2<.32?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.10)"; ctx.fill(cb2);
          ctx.strokeStyle=stroke2; ctx.lineWidth=1; ctx.stroke(cb2);
        }
        if (paths.collar) {
          const cp2=new Path2D(paths.collar);
          ctx.fillStyle=baseColorHex; ctx.fill(cp2);
          ctx.strokeStyle=stroke2; ctx.lineWidth=1.2; ctx.stroke(cp2);
        }
        if (paths.placket) {
          const pp2=new Path2D(paths.placket);
          ctx.fillStyle=lum2<.32?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"; ctx.fill(pp2);
          ctx.strokeStyle=stroke2; ctx.lineWidth=.8; ctx.stroke(pp2);
        }
        if (paths.buttons) {
          for (const [bx,by] of paths.buttons) {
            ctx.beginPath(); ctx.arc(bx,by,2.2,0,Math.PI*2);
            ctx.fillStyle=lum2<.32?"rgba(255,255,255,0.55)":"rgba(0,0,0,0.30)"; ctx.fill();
          }
        }
        ctx.restore();
      }

      /* Arte overlay — qualidade máxima */
      if (artCanvas) {
        ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.08;
        ctx.drawImage(artCanvas, artX, artY, artSize, artSize); ctx.restore();
        ctx.save(); ctx.globalAlpha = 1.0;
        ctx.drawImage(artCanvas, artX, artY, artSize, artSize); ctx.restore();
      }

      /* Sombra de contacto + vinheta discreta */
      const shadow = ctx.createRadialGradient(W*.5, H*.90, W*.01, W*.5, H*.90, W*.40);
      shadow.addColorStop(0, "rgba(0,0,0,.18)"); shadow.addColorStop(.50, "rgba(0,0,0,.05)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shadow; ctx.fillRect(0, H*.76, W, H*.24);

      const vig = ctx.createRadialGradient(W*.5, H*.46, Math.min(W,H)*.38, W*.5, H*.5, Math.max(W,H)*.82);
      vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      return canvas;
    },
  }), [baseColorHex, productType]);

  const gestureRef = useRef<ActiveGesture | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const layersRef = useRef<DraggableLayer[]>([]);
  const hitMinPx = touchFriendly ? TOUCH_HIT_MIN_PX : DESKTOP_HIT_MIN_PX;
  const hitMinRef = useRef(hitMinPx);
  hitMinRef.current = hitMinPx;
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /* ── Sincroniza layers ref ── */
  useEffect(() => { layersRef.current = layers ?? []; }, [layers]);

  /* ── ResizeObserver: ajusta o canvas ao contentor real ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 10 && height > 10) {
          setCanvasSize({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  /* ── Carrega a foto da peça ── */
  useEffect(() => {
    let cancelled = false;
    setGarmentImage(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { if (!cancelled) setGarmentImage(img); };
    img.onerror = () => { if (!cancelled) setGarmentImage(null); };
    img.src = modelagemModelImageUrl(productType);
    return () => { cancelled = true; };
  }, [productType]);

  /* ── Pré-computa frente + costas quando a imagem ou cor mudam ── */
  useEffect(() => {
    if (!garmentImage) { setTintedFront(null); setTintedBack(null); return; }
    try {
      setTintedFront(prepareTintedGarment(garmentImage, baseColorHex, "front"));
      setTintedBack (prepareTintedGarment(garmentImage, baseColorHex, "back"));
    } catch {
      setTintedFront(null);
      setTintedBack(null);
    }
  }, [garmentImage, baseColorHex]);

  /* ── Canvas principal ── */
  useEffect(() => {
    const out = outRef.current;
    if (!out) return;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const W = out.width, H = out.height;
    ctx.clearRect(0, 0, W, H);

    /* Fundo principal — estúdio claro (evita o aspecto escuro/fusco) */
    const bg = ctx.createRadialGradient(W * .5, H * .38, W * .05, W * .5, H * .5, Math.max(W, H) * .95);
    bg.addColorStop(0,   "#3a4f6e");
    bg.addColorStop(.40, "#263650");
    bg.addColorStop(.75, "#162438");
    bg.addColorStop(1,   "#0d1828");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    /* Spot light principal — luz de estúdio intensa vinda de cima */
    const spot = ctx.createRadialGradient(W * .5, -H * .08, W * .03, W * .5, H * .38, H * .85);
    spot.addColorStop(0,   "rgba(220,235,255,0.55)");
    spot.addColorStop(.25, "rgba(190,215,255,0.30)");
    spot.addColorStop(.55, "rgba(150,185,240,0.10)");
    spot.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);

    /* Segundo spot lateral esquerdo — suavidade 3D */
    const spot2 = ctx.createRadialGradient(W * .15, H * .25, W * .02, W * .25, H * .45, W * .55);
    spot2.addColorStop(0,  "rgba(180,210,255,0.14)");
    spot2.addColorStop(.5, "rgba(140,175,230,0.05)");
    spot2.addColorStop(1,  "rgba(0,0,0,0)");
    ctx.fillStyle = spot2; ctx.fillRect(0, 0, W, H);

    /* Reflexo de piso — mais luminoso */
    const floor = ctx.createLinearGradient(0, H * .62, 0, H);
    floor.addColorStop(0,   "rgba(100,140,220,0)");
    floor.addColorStop(.35, "rgba(80,120,200,.10)");
    floor.addColorStop(.70, "rgba(50, 85,160,.05)");
    floor.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = floor; ctx.fillRect(0, H * .62, W, H * .38);

    const { artSize, artX, artY } = artLayout(W, H);

    const tintedGarment = side === "front" ? tintedFront : tintedBack;

    if (tintedGarment) {
      /* ── Peça fotorrealista: foto tintada com multiply + fundo removido ── */
      const fw = tintedGarment.width;
      const fh = tintedGarment.height;

      /* Escalar para caber no canvas mantendo o aspect ratio */
      const scale = Math.min(W / fw, H / fh) * 0.93;
      const dw = fw * scale;
      const dh = fh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2 - H * 0.02;

      /* Sombra suave antes da peça */
      const dropShadow = ctx.createRadialGradient(W * .5, dy + dh * .96, W * .01, W * .5, dy + dh * .96, W * .35);
      dropShadow.addColorStop(0,   "rgba(0,0,0,0.50)");
      dropShadow.addColorStop(0.5, "rgba(0,0,0,0.15)");
      dropShadow.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = dropShadow;
      ctx.fillRect(0, dy + dh * .80, W, dh * .25);

      ctx.drawImage(tintedGarment, dx, dy, dw, dh);

    } else {
      /* ── Fallback SVG melhorado ── */
      const gScale = artSize / 200;
      const paths = garmentSvgPaths(productType);
      const bodyPath = new Path2D(paths.body);
      const lum = (function lx(hex: string) {
        const s = hex.replace("#",""); if (s.length!==6) return .5;
        return parseInt(s.slice(0,2),16)/255*.2126+parseInt(s.slice(2,4),16)/255*.7152+parseInt(s.slice(4,6),16)/255*.0722;
      })(baseColorHex);
      const stroke = garmentStrokeRgba(baseColorHex);

      ctx.save();
      ctx.translate(artX, artY);
      ctx.scale(gScale, gScale);

      /* Corpo */
      ctx.fillStyle = baseColorHex;
      ctx.fill(bodyPath);

      /* Sombreado de volume — subtil, preserva a cor real */
      ctx.save();
      ctx.clip(bodyPath);
      const topLight = ctx.createLinearGradient(100, 28, 100, 188);
      topLight.addColorStop(0,   "rgba(255,255,255,0.12)");
      topLight.addColorStop(.40, "rgba(255,255,255,0.00)");
      topLight.addColorStop(1,   "rgba(0,0,0,0.10)");
      ctx.fillStyle = topLight; ctx.fillRect(-5,-5,210,210);
      const edgeDark = ctx.createRadialGradient(100,108,50,100,108,108);
      edgeDark.addColorStop(0, "rgba(0,0,0,0)");
      edgeDark.addColorStop(1, "rgba(0,0,0,0.10)");
      ctx.fillStyle = edgeDark; ctx.fillRect(-5,-5,210,210);
      ctx.restore();

      /* Contorno corpo */
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.lineJoin = "round";
      ctx.stroke(bodyPath);

      /* Banda interior do decote */
      if (paths.collarBand) {
        const cbPath = new Path2D(paths.collarBand);
        ctx.fillStyle = baseColorHex; ctx.fill(cbPath);
        ctx.fillStyle = lum < .32 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
        ctx.fill(cbPath);
        ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(cbPath);
      }

      /* Gola polo */
      if (paths.collar) {
        const cp = new Path2D(paths.collar);
        ctx.fillStyle = baseColorHex; ctx.fill(cp);
        ctx.save(); ctx.clip(cp);
        const foldG = ctx.createLinearGradient(100,22,100,65);
        foldG.addColorStop(0, "rgba(255,255,255,0.28)");
        foldG.addColorStop(.5, "rgba(0,0,0,0)");
        foldG.addColorStop(1, "rgba(0,0,0,0.16)");
        ctx.fillStyle = foldG; ctx.fillRect(80,20,40,50); ctx.restore();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(cp);
        /* Linha de prega */
        ctx.save();
        ctx.strokeStyle = lum<.32?"rgba(255,255,255,0.18)":"rgba(0,0,0,0.14)";
        ctx.lineWidth=.8; ctx.setLineDash([3,2]);
        ctx.beginPath(); ctx.moveTo(85,46); ctx.bezierCurveTo(90,44,110,44,115,46); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }

      /* Placket do polo */
      if (paths.placket) {
        const pp = new Path2D(paths.placket);
        ctx.fillStyle = lum<.32?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)";
        ctx.fill(pp); ctx.strokeStyle = stroke; ctx.lineWidth=.8; ctx.stroke(pp);
      }

      /* Botões do polo */
      if (paths.buttons) {
        for (const [bx,by] of paths.buttons) {
          ctx.beginPath(); ctx.arc(bx,by,2.2,0,Math.PI*2);
          ctx.fillStyle = lum<.32?"rgba(255,255,255,0.55)":"rgba(0,0,0,0.30)"; ctx.fill();
          ctx.strokeStyle = lum<.32?"rgba(255,255,255,0.20)":"rgba(0,0,0,0.12)";
          ctx.lineWidth=.6; ctx.stroke();
        }
      }

      /* Costuras tracejadas */
      ctx.strokeStyle = lum<.32?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.10)";
      ctx.lineWidth=.7; ctx.setLineDash([3,2.5]); ctx.lineCap="round";
      for (const k of ["seamShoulderL","seamShoulderR","seamCuffL","seamCuffR"] as const) {
        const d = paths[k]; if (d) { const p=new Path2D(d); ctx.stroke(p); }
      }
      ctx.setLineDash([]);

      ctx.restore();
    }

    /* Arte do utilizador — qualidade máxima, sem blending que degrade as cores */
    const artCanvas = artCanvasRef.current;
    if (artCanvas) {
      /* Subtil integração com textura da peça (muito leve) */
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.08;
      ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
      ctx.restore();
      /* Arte a 100 % — cores e nitidez preservadas */
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
      ctx.restore();
    }

    /* Sombra de contacto no piso — discreta */
    const shadow = ctx.createRadialGradient(W * .5, H * .90, W * .01, W * .5, H * .90, W * .40);
    shadow.addColorStop(0,   "rgba(0,0,0,.18)");
    shadow.addColorStop(.50, "rgba(0,0,0,.05)");
    shadow.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = shadow; ctx.fillRect(0, H * .76, W, H * .24);

    /* Vinheta — muito suave, apenas bordo leve */
    const vig = ctx.createRadialGradient(W * .5, H * .46, Math.min(W,H) * .38, W * .5, H * .5, Math.max(W,H) * .82);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,.16)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

  }, [artCanvasRef, drawVersion, productType, baseColorHex, tintedFront, tintedBack, side, canvasSize]);

  /* ── Canvas de highlight + guia de área de impressão ── */
  useEffect(() => {
    const hl = hlRef.current;
    if (!hl) return;
    const ctx = hl.getContext("2d");
    if (!ctx) return;
    const c2d: CanvasRenderingContext2D = ctx;
    const W = hl.width, H = hl.height;
    c2d.clearRect(0, 0, W, H);

    /* ── Indicador de camada (seleccionada persistente + hover) ── */
    function drawLayerHandle(layer: DraggableLayer, isSelected: boolean, dragging: boolean) {
      const { cx, cy, hw, hh } = layerBounds(layer, W, H, hitMinPx);
      const angle = (layer.rotationDeg * Math.PI) / 180;
      c2d.save();
      c2d.translate(cx, cy);
      c2d.rotate(angle);

      const color = dragging
        ? "rgba(250,204,21,.95)"
        : isSelected
          ? "rgba(52,211,153,.95)"    // teal para seleccionada
          : "rgba(99,210,250,.75)";   // azul claro para hover

      c2d.strokeStyle = color;
      c2d.lineWidth = isSelected ? 1.8 : 1.4;
      c2d.setLineDash(isSelected ? [6, 3] : [4, 3]);
      c2d.strokeRect(-hw, -hh, hw * 2, hh * 2);
      c2d.setLineDash([]);

      /* Cantos sólidos (L-handles) */
      const mk = Math.max(6, Math.min(14, Math.min(hw, hh) * 0.3));
      c2d.strokeStyle = color; c2d.lineWidth = 2; c2d.lineCap = "round";
      for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
        c2d.beginPath();
        c2d.moveTo(sx * hw, sy * hh - sy * mk);
        c2d.lineTo(sx * hw, sy * hh);
        c2d.lineTo(sx * hw - sx * mk, sy * hh);
        c2d.stroke();
      }

      /* Ícone de mover (apenas no hover / drag) */
      if (!isSelected || dragging) {
        const a = 7, b = 4;
        c2d.strokeStyle = color; c2d.lineWidth = 1.5; c2d.lineCap = "round"; c2d.lineJoin = "round";
        c2d.beginPath(); c2d.moveTo(-a, 0); c2d.lineTo(a, 0); c2d.stroke();
        c2d.beginPath(); c2d.moveTo(a-b,-b); c2d.lineTo(a,0); c2d.lineTo(a-b,b); c2d.stroke();
        c2d.beginPath(); c2d.moveTo(-a+b,-b); c2d.lineTo(-a,0); c2d.lineTo(-a+b,b); c2d.stroke();
        c2d.beginPath(); c2d.moveTo(0,-a); c2d.lineTo(0,a); c2d.stroke();
        c2d.beginPath(); c2d.moveTo(-b,a-b); c2d.lineTo(0,a); c2d.lineTo(b,a-b); c2d.stroke();
        c2d.beginPath(); c2d.moveTo(-b,-a+b); c2d.lineTo(0,-a); c2d.lineTo(b,-a+b); c2d.stroke();
      }

      c2d.restore();
    }

    /* Desenha primeiro a selecção persistente, depois o hover */
    if (layers?.length) {
      const selLayer = selectedId ? layers.find((l) => l.id === selectedId) : null;
      const hovLayer = hoveredId && hoveredId !== selectedId ? layers.find((l) => l.id === hoveredId) : null;
      if (selLayer)  drawLayerHandle(selLayer,  true,  isDragging && hoveredId === selectedId);
      if (hovLayer)  drawLayerHandle(hovLayer,  false, false);
    }
  }, [hoveredId, isDragging, layers, canvasSize, selectedId, hitMinPx]);

  /* ── Interacção de ponteiro (1 dedo = mover; 2 dedos = pinch + rotação) ── */
  const beginPinch = useCallback((
    layerId: string,
    a: Point,
    b: Point,
    ids: [number, number],
  ) => {
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
  }, [onDragStart]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") e.preventDefault();
    const pos = toCanvasCoords(e);
    const W = e.currentTarget.width, H = e.currentTarget.height;
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
        hitTest(midpoint(pA, pB).x, midpoint(pA, pB).y, arr, W, H, hitMinRef.current) ??
        hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current);
      if (targetId) {
        const layer = arr.find((l) => l.id === targetId);
        if (layer && !layer.locked) {
          beginPinch(targetId, pA, pB, [idA, idB]);
          return;
        }
      }
    }

    const id = hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current);
    if (!id) { setHoveredId(null); return; }
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
  }, [beginPinch, onDragStart, onSelectLayer, selectedId]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") e.preventDefault();
    const pos = toCanvasCoords(e);
    const W = e.currentTarget.width, H = e.currentTarget.height;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, pos);
    }
    const g = gestureRef.current;
    if (!g) {
      const arr = layersRef.current;
      setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current) : null);
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
    if (!g.moved && (Math.abs(scaleFactor - 1) > 0.02 || Math.abs(rotDelta) > 2 || Math.abs(mx) > 0.002 || Math.abs(my) > 0.002)) {
      g.moved = true;
    }
    onTransformLayer?.(g.id, {
      x: clamp01(g.origX + mx),
      y: clamp01(g.origY + my),
      scale: clampScale(g.origScale * scaleFactor),
      rotationDeg: normalizeRotation(g.origRot + rotDelta),
    });
  }, [onMoveLayer, onTransformLayer]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }

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
      const pos = toCanvasCoords(e);
      const W = e.currentTarget.width, H = e.currentTarget.height;
      const arr = layersRef.current;
      setHoveredId(arr.length ? hitTest(pos.x, pos.y, arr, W, H, hitMinRef.current) : null);
      if (!moved) onSelectLayer?.(id);
      return;
    }

    if (!remaining.length) {
      gestureRef.current = null;
      setIsDragging(false);
    }
  }, [onSelectLayer]);

  const handlePointerLeave = useCallback(() => {
    if (!gestureRef.current && pointersRef.current.size === 0) setHoveredId(null);
  }, []);

  const hoveredLayer = hoveredId && layers?.length
    ? layers.find((l) => l.id === hoveredId)
    : undefined;
  const cursorClass = isDragging
    ? "cursor-grabbing"
    : hoveredLayer?.locked
      ? "cursor-default"
      : hoveredId
        ? "cursor-grab"
        : "";

  const shellClass = className ?? "relative w-full min-h-[240px] overflow-hidden rounded-2xl";

  return (
    <div ref={containerRef} className={`${shellClass} isolate`}>

      {/* Canvas principal — dimensões idênticas ao contentor (sem letterbox) */}
      <canvas
        ref={outRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="absolute inset-0 h-full w-full"
      />

      {/* Canvas de highlight + eventos de ponteiro */}
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
        onPointerLeave={handlePointerLeave}
      />

      {/* ── Header flutuante ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#03050a]/90 via-[#03050a]/40 to-transparent px-4 pb-14 pt-3">
        <div className="flex items-center justify-between gap-2">

          {/* Esquerda: badge "Ao vivo" */}
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/[0.13] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300/80 ring-1 ring-emerald-400/20">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Ao vivo
          </span>

          {/* Centro: etiqueta da camada seleccionada */}
          {selectedLayerLabel && side === "front" && (
            <div className="flex min-w-0 flex-1 justify-center">
              <span className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full border border-amber-500/20 bg-zinc-950/50 px-2.5 py-0.5 text-[10px] font-medium text-amber-300/85 backdrop-blur-sm">
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-amber-400/70" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" />
                  <line x1="4" y1="6" x2="8" y2="6" />
                  <line x1="6" y1="4" x2="6" y2="8" />
                </svg>
                <span className="truncate">{selectedLayerLabel}</span>
              </span>
            </div>
          )}

          {/* Direita: contagem de camadas + caption */}
          <div className="flex shrink-0 items-center gap-2">
            {(layers?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/70 px-2 py-0.5 text-[9px] font-medium text-zinc-400/80 ring-1 ring-white/[0.06] backdrop-blur-sm">
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="4.5" height="4.5" rx="0.8" />
                  <rect x="6.5" y="1" width="4.5" height="4.5" rx="0.8" />
                  <rect x="1" y="6.5" width="4.5" height="4.5" rx="0.8" />
                  <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="0.8" />
                </svg>
                {layers!.length}
              </span>
            )}
            {caption && <span className="text-[10px] text-zinc-500/70">{caption}</span>}
          </div>
        </div>
      </div>

      {/* ── Toggle Frente / Costas ── */}
      <div className="pointer-events-auto absolute left-1/2 top-1.5 z-20 -translate-x-1/2">
        <div className="flex rounded-full border border-white/[0.10] bg-black/60 p-0.5 shadow-lg shadow-black/40 backdrop-blur-md">
          {(["front", "back"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSideChange?.(s)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold transition-all duration-150 ${
                side === s
                  ? "bg-white/[0.14] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "front" ? (
                <>
                  {/* Ícone frente */}
                  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 2 C5 2 5.5 4 7 4 C8.5 4 9 2 9 2 L11 2.5 C12 2.8 13 4 13 5 L11.5 5.5 C11 4.5 10.5 4.2 10 4.2 L10 12 L4 12 L4 4.2 C3.5 4.2 3 4.5 2.5 5.5 L1 5 C1 4 2 2.8 3 2.5 Z" />
                  </svg>
                  Frente
                </>
              ) : (
                <>
                  {/* Ícone costas */}
                  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 2 C5 2 5.5 4 7 4 C8.5 4 9 2 9 2 L11 2.5 C12 2.8 13 4 13 5 L11.5 5.5 C11 4.5 10.5 4.2 10 4.2 L10 12 L4 12 L4 4.2 C3.5 4.2 3 4.5 2.5 5.5 L1 5 C1 4 2 2.8 3 2.5 Z" />
                    <path d="M5.5 6.5 Q7 5.5 8.5 6.5" strokeDasharray="1.5 1" />
                  </svg>
                  Costas
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso de vista de costas (arte está na frente) */}
      {side === "back" && (layers?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/40 bg-black/55 px-4 py-1.5 text-[10px] font-medium text-zinc-500 backdrop-blur-xl">
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="6" cy="6" r="4.5" /><line x1="6" y1="4" x2="6" y2="6.5" /><circle cx="6" cy="8.5" r=".5" fill="currentColor" />
            </svg>
            Vista de costas · a arte está na frente
          </p>
        </div>
      )}

      {/* ── Estado vazio ── */}
      {(!layers || layers.length === 0) && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
            {/* Ícone camisola */}
            <svg viewBox="0 0 40 40" fill="none" className="h-8 w-8 text-zinc-600" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 6 L6 12 L11 14 L11 34 L29 34 L29 14 L34 12 L27 6 C27 6 24 10 20 10 C16 10 13 6 13 6Z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-zinc-400/90">Sem elementos</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">Adiciona texto ou imagem no painel →</p>
          </div>
        </div>
      )}

      {/* ── Rodapé de atalhos (quando há camadas e não está a arrastar) ── */}
      {showFooterHint && !isDragging && (layers?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-black/50 px-3 py-1.5 backdrop-blur-xl">
            {(touchFriendly
              ? [
                  { key: "1↑", label: "mover" },
                  { key: "2↕", label: "escala" },
                  { key: "2↻", label: "rodar" },
                ]
              : [
                  { key: "↑↓←→", label: "mover" },
                  { key: "⌦", label: "apagar" },
                  { key: "⌃Z", label: "desfazer" },
                ]
            ).map(({ key, label }) => (
              <span key={key} className="flex items-center gap-1">
                <kbd className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-mono font-semibold text-zinc-300/80 ring-1 ring-white/[0.08]">{key}</kbd>
                <span className="text-[9px] text-zinc-600">{label}</span>
                <span className="ml-0.5 h-2.5 w-px bg-zinc-700/60 last:hidden" />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hint vazio (sem camadas) */}
      {showFooterHint && !isDragging && (layers?.length ?? 0) === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <p className="rounded-full border border-white/[0.06] bg-black/50 px-4 py-1.5 text-[10px] font-medium text-zinc-600 backdrop-blur-xl">
            pré-visualização da impressão na peça
          </p>
        </div>
      )}

      {/* Indicador de arrasto */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <p className="rounded-full border border-yellow-400/20 bg-yellow-500/[0.10] px-4 py-1.5 text-center text-[10px] font-semibold tracking-wide text-yellow-300/90 shadow-lg shadow-black/50 backdrop-blur-xl">
            a reposicionar elemento — solte para confirmar
          </p>
        </div>
      )}
    </div>
  );
});
