/**
 * Silhuetas e áreas de impressão para canecas e impressão plana (mockup 2D).
 */

/** Área de impressão na caneca (espaço normalizado 200×200). */
export const MUG_PRINT_AREA = { x: 52, y: 48, w: 96, h: 72 };

/** Silhueta simplificada de caneca (vista frontal). */
export const MUG_BODY_PATH = [
  "M 58,168",
  "L 58,72",
  "Q 58,44 78,40",
  "L 122,40",
  "Q 142,44 142,72",
  "L 142,168",
  "Q 142,178 132,182",
  "L 68,182",
  "Q 58,178 58,168",
  "Z",
].join(" ");

export const MUG_HANDLE_PATH = [
  "M 142,78",
  "Q 168,82 168,110",
  "Q 168,138 142,142",
  "L 142,128",
  "Q 158,124 158,110",
  "Q 158,96 142,92",
  "Z",
].join(" ");

/** Cartão no espaço 200×200 — centrado com aspect ratio variável. */
export function flatCardRect(aspect: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const maxW = 120;
  const maxH = 100;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { x: (200 - w) / 2, y: (200 - h) / 2, w, h };
}

/** Dois cartões (frente + verso) lado a lado. */
export function flatDualCardRects(aspect: number): {
  front: { x: number; y: number; w: number; h: number };
  back: { x: number; y: number; w: number; h: number };
} {
  const maxW = 78;
  const maxH = 88;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const gap = 12;
  const totalW = w * 2 + gap;
  const startX = (200 - totalW) / 2;
  const y = (200 - h) / 2;
  return {
    front: { x: startX, y, w, h },
    back: { x: startX + w + gap, y, w, h },
  };
}
