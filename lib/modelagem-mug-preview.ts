/**
 * Mockup fotorrealista de caneca — foto base + tinting por cor.
 */

export const MODELAGEM_MUG_IMAGE = "/img/modelo-caneca.png";

/** Área de sublimação normalizada (0–1) dentro da foto da caneca. */
export const MUG_PHOTO_PRINT_AREA = {
  x: 0.14,
  y: 0.2,
  w: 0.48,
  h: 0.42,
};

function parseHexRgb(hex: string): [number, number, number] {
  const s = hex.replace("#", "").trim();
  if (s.length !== 6) return [242, 242, 242];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** Aplica cor cerâmica e remove fundo escuro da foto. */
export function prepareTintedMug(
  img: HTMLImageElement,
  colorHex: string,
): HTMLCanvasElement {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const tmp = document.createElement("canvas");
  tmp.width = iw;
  tmp.height = ih;
  const ctx = tmp.getContext("2d");
  if (!ctx) return tmp;

  ctx.drawImage(img, 0, 0, iw, ih);
  const orig = ctx.getImageData(0, 0, iw, ih).data;

  const [tr, tg, tb] = parseHexRgb(colorHex);
  const isNearWhite = tr > 230 && tg > 230 && tb > 230;

  if (!isNearWhite) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, iw, ih);
    ctx.globalCompositeOperation = "source-over";
  }

  const colored = ctx.getImageData(0, 0, iw, ih);
  const d = colored.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = orig[i]!;
    const g = orig[i + 1]!;
    const b = orig[i + 2]!;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;

    if (lum < 32) {
      d[i + 3] = 0;
      continue;
    }

    if (isNearWhite && lum > 248) {
      d[i + 3] = Math.round(d[i + 3]! * Math.max(0, (255 - lum) / 12));
    }
  }
  ctx.putImageData(colored, 0, 0);
  return tmp;
}

export type MugDrawRect = {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

/** Posição da caneca — centra a área de sublimação no artboard. */
export function mugDrawRect(
  W: number,
  H: number,
  mugCanvas: HTMLCanvasElement,
): MugDrawRect {
  const artSize = H * 0.93;
  const artX = (W - artSize) / 2;
  const artY = (H - artSize) / 2 - H * 0.015;

  const fw = mugCanvas.width;
  const fh = mugCanvas.height;
  const scale = Math.min(artSize / fw, artSize / fh) * 0.88;
  const dw = fw * scale;
  const dh = fh * scale;

  const pa = MUG_PHOTO_PRINT_AREA;
  const artCenterX = artX + artSize / 2;
  const artCenterY = artY + artSize / 2;
  const dx = artCenterX - dw * (pa.x + pa.w / 2);
  const dy = artCenterY - dh * (pa.y + pa.h / 2);

  return { dx, dy, dw, dh };
}

/**
 * Desenha caneca fotorrealista + sombra no canvas.
 */
export function drawPhotoMug(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tintedMug: HTMLCanvasElement,
): MugDrawRect {
  const rect = mugDrawRect(W, H, tintedMug);

  const dropShadow = ctx.createRadialGradient(
    W * 0.5,
    rect.dy + rect.dh * 0.96,
    W * 0.01,
    W * 0.5,
    rect.dy + rect.dh * 0.96,
    W * 0.35,
  );
  dropShadow.addColorStop(0, "rgba(0,0,0,0.55)");
  dropShadow.addColorStop(0.5, "rgba(0,0,0,0.18)");
  dropShadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = dropShadow;
  ctx.fillRect(0, rect.dy + rect.dh * 0.78, W, rect.dh * 0.28);

  ctx.drawImage(tintedMug, rect.dx, rect.dy, rect.dw, rect.dh);

  return rect;
}

/** Arte em coordenadas do artboard completo (alinhada ao editor de camadas). */
export function drawMugArtOverlayFull(
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
  ctx.globalAlpha = 0.08;
  ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
  ctx.restore();
}

/** Vinheta e sombra de contacto (igual vestuário). */
export function drawMockupFinish(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const shadow = ctx.createRadialGradient(W * 0.5, H * 0.9, W * 0.01, W * 0.5, H * 0.9, W * 0.4);
  shadow.addColorStop(0, "rgba(0,0,0,.18)");
  shadow.addColorStop(0.5, "rgba(0,0,0,.05)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, H * 0.76, W, H * 0.24);

  const vig = ctx.createRadialGradient(
    W * 0.5,
    H * 0.46,
    Math.min(W, H) * 0.38,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.82,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
