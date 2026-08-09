/**
 * Layout partilhado entre mockups 2D (vestuário e não-vestuário).
 */
export const ART_CANVAS_SIZE = 512;
export const ART_FACTOR = 0.93;

export function artLayout(W: number, H: number) {
  const artSize = H * ART_FACTOR;
  const artX = (W - artSize) / 2;
  const artY = (H - artSize) / 2 - H * 0.015;
  const artScale = artSize / ART_CANVAS_SIZE;
  return { artSize, artX, artY, artScale };
}

export function drawStudioBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): void {
  const bg = ctx.createRadialGradient(
    W * 0.5,
    H * 0.38,
    W * 0.04,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.95,
  );
  bg.addColorStop(0, "#3a4f6e");
  bg.addColorStop(0.4, "#263650");
  bg.addColorStop(0.75, "#162438");
  bg.addColorStop(1, "#0d1828");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const spot = ctx.createRadialGradient(
    W * 0.5,
    -H * 0.08,
    W * 0.03,
    W * 0.5,
    H * 0.38,
    H * 0.85,
  );
  spot.addColorStop(0, "rgba(220,235,255,0.55)");
  spot.addColorStop(0.25, "rgba(190,215,255,0.30)");
  spot.addColorStop(0.55, "rgba(150,185,240,0.10)");
  spot.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  const spot2 = ctx.createRadialGradient(
    W * 0.15,
    H * 0.25,
    W * 0.02,
    W * 0.25,
    H * 0.45,
    W * 0.55,
  );
  spot2.addColorStop(0, "rgba(180,210,255,0.14)");
  spot2.addColorStop(0.5, "rgba(140,175,230,0.05)");
  spot2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spot2;
  ctx.fillRect(0, 0, W, H);

  const floor = ctx.createLinearGradient(0, H * 0.62, 0, H);
  floor.addColorStop(0, "rgba(100,140,220,0)");
  floor.addColorStop(0.35, "rgba(80,120,200,.10)");
  floor.addColorStop(0.7, "rgba(50,85,160,.05)");
  floor.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
}

export function drawArtOverlay(
  ctx: CanvasRenderingContext2D,
  artCanvas: HTMLCanvasElement | null,
  W: number,
  H: number,
): void {
  if (!artCanvas) return;
  const { artSize, artX, artY } = artLayout(W, H);
  ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
}
