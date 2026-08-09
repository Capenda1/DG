/**
 * Mockup de impressão plana (cartão de visita, passe PVC) — artboard 512×512.
 */
import { ART_CANVAS_SIZE } from "@/lib/modelagem-canvas-layout";

export type FlatCardRect = { x: number; y: number; w: number; h: number };

/** Cartão activo (frente ou verso) centrado e grande no artboard. */
export function flatActiveCardRect(aspect: number): FlatCardRect {
  const S = ART_CANVAS_SIZE;
  const maxW = S * 0.84;
  const maxH = S * 0.74;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return {
    x: (S - w) / 2,
    y: (S - h) / 2,
    w,
    h,
  };
}

/** Converte rect do artboard (512) para pixels no canvas de saída. */
export function flatCardRectOnCanvas(
  W: number,
  H: number,
  aspect: number,
): FlatCardRect {
  const { artSize, artX, artY, artScale } = (function () {
    const artSize = H * 0.93;
    const artX = (W - artSize) / 2;
    const artY = (H - artSize) / 2 - H * 0.015;
    const artScale = artSize / ART_CANVAS_SIZE;
    return { artSize, artX, artY, artScale };
  })();
  const r = flatActiveCardRect(aspect);
  return {
    x: artX + r.x * artScale,
    y: artY + r.y * artScale,
    w: r.w * artScale,
    h: r.h * artScale,
  };
}

export function drawFlatCardMockup(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  aspect: number,
  side: "front" | "back",
): FlatCardRect {
  const artSize = H * 0.93;
  const artX = (W - artSize) / 2;
  const artY = (H - artSize) / 2 - H * 0.015;
  const artScale = artSize / ART_CANVAS_SIZE;
  const card = flatActiveCardRect(aspect);

  ctx.save();
  ctx.translate(artX, artY);
  ctx.scale(artScale, artScale);

  const r = card;
  const label = side === "front" ? "Frente" : "Verso";

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#fafafa";
  roundRect(ctx, r.x + 6, r.y + 8, r.w, r.h, 8);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(99,102,241,0.5)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6);
  ctx.stroke();

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "rgba(99,102,241,0.22)";
  ctx.lineWidth = 1;
  roundRect(ctx, r.x + 10, r.y + 10, r.w - 20, r.h - 20, 4);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(99,102,241,0.9)";
  ctx.font = "bold 13px system-ui,sans-serif";
  ctx.fillText(label, r.x + 12, r.y - 10);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.font = "10px system-ui,sans-serif";
  const aspectLabel =
    aspect > 1.7 ? "90×50 mm" : aspect > 1.5 ? "CR80" : "Impressão plana";
  ctx.fillText(aspectLabel, r.x + r.w - 72, r.y + r.h + 18);

  ctx.restore();

  return {
    x: artX + r.x * artScale,
    y: artY + r.y * artScale,
    w: r.w * artScale,
    h: r.h * artScale,
  };
}

export function drawFlatArtOverlay(
  ctx: CanvasRenderingContext2D,
  artCanvas: HTMLCanvasElement | null,
  W: number,
  H: number,
): void {
  if (!artCanvas) return;
  const artSize = H * 0.93;
  const artX = (W - artSize) / 2;
  const artY = (H - artSize) / 2 - H * 0.015;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.06;
  ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
