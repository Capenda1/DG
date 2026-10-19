import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { measureCircularArt } from "./lib/png-bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "marketing", "lona");
const logoFile = path.join(root, "docs", "marketing", "logo", "logo-dg-monograma.png");

const SIDE = 2000; // 2 m × 2 m, em milímetros
const GOLD = [224, 171, 53];
const GOLD_DEEP = [179, 126, 24];
const BLACK = [14, 14, 16];
const WHITE = [255, 255, 255];

const logo = measureCircularArt(logoFile);
const logoData = `data:image/png;base64,${fs.readFileSync(logoFile).toString("base64")}`;

/** Maior corpo de letra que mantém o texto dentro de `maxWidth`. */
function fitFontSize(doc, text, maxWidth, startSize) {
  let size = startSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(text) > maxWidth && size > 8) {
    size -= 2;
    doc.setFontSize(size);
  }
  return size;
}

function centeredText(doc, text, centerX, baselineY, maxWidth, startSize, color, style = "bold") {
  doc.setFont("helvetica", style);
  doc.setTextColor(...color);
  const size = fitFontSize(doc, text, maxWidth, startSize);
  doc.text(text, centerX, baselineY, { align: "center" });
  return size;
}

/** Cantos decorativos dourados (equivalente vectorial dos ornamentos da arte). */
function cornerAccents(doc, x0, y0, side, inset, arm, thickness) {
  doc.setDrawColor(...GOLD_DEEP);
  doc.setLineWidth(thickness);
  const l = x0 + inset;
  const r = x0 + side - inset;
  const t = y0 + inset;
  const b = y0 + side - inset;

  doc.line(l, t, l + arm, t);
  doc.line(l, t, l, t + arm);
  doc.line(r - arm, t, r, t);
  doc.line(r, t, r, t + arm);
  doc.line(l, b - arm, l, b);
  doc.line(l, b, l + arm, b);
  doc.line(r, b - arm, r, b);
  doc.line(r - arm, b, r, b);
}

function drawLogoCircle(doc, centerX, centerY, diameter) {
  const radius = diameter / 2;
  const scale = (diameter + 4) / logo.diameterPx;
  const drawW = logo.image.width * scale;
  const drawH = logo.image.height * scale;
  const drawX = centerX - logo.centerXPx * scale;
  const drawY = centerY - logo.centerYPx * scale;

  doc.saveGraphicsState();
  doc.circle(centerX, centerY, radius, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(logoData, "PNG", drawX, drawY, drawW, drawH, undefined, "NONE");
  doc.restoreGraphicsState();

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(6);
  doc.circle(centerX, centerY, radius, "S");
}

function roundedCta(doc, text, centerX, topY, height, maxWidth) {
  doc.setFont("helvetica", "bold");
  const size = fitFontSize(doc, text, maxWidth - 160, 460);
  const width = Math.min(maxWidth, doc.getTextWidth(text) + 200);
  const x = centerX - width / 2;

  doc.setFillColor(...GOLD);
  doc.roundedRect(x, topY, width, height, height / 2, height / 2, "F");
  doc.setTextColor(...BLACK);
  doc.setFontSize(size);
  doc.text(text, centerX, topY + height / 2 + size * 0.35 * 0.3528, {
    align: "center",
  });
}

function buildLona({ file, bleed }) {
  const page = SIDE + bleed * 2;
  const doc = new jsPDF({ unit: "mm", format: [page, page], compress: true });
  const o = bleed; // origem da área final
  const cx = o + SIDE / 2;

  doc.setFillColor(...BLACK);
  doc.rect(0, 0, page, page, "F");

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(10);
  doc.rect(o + 70, o + 70, SIDE - 140, SIDE - 140, "S");
  cornerAccents(doc, o, o, SIDE, 120, 150, 6);

  drawLogoCircle(doc, cx, o + 430, 480);

  const textMax = SIDE - 320;
  centeredText(doc, "A sua ideia.", cx, o + 940, textMax, 620, WHITE);
  centeredText(doc, "Na sua peça.", cx, o + 1160, textMax, 620, GOLD);

  centeredText(
    doc,
    "T-shirts  ·  Polos  ·  Coletes  ·  Bonés  ·  Lonas",
    cx,
    o + 1300,
    textMax,
    200,
    WHITE,
    "normal",
  );

  roundedCta(doc, "COMEÇAR O MEU PEDIDO", cx, o + 1420, 180, SIDE - 400);

  centeredText(doc, "graficadadiva.com", cx, o + 1790, textMax, 300, GOLD);

  const target = path.join(outDir, file);
  doc.save(target);
  console.log(`${file} · página ${page}×${page} mm · sangria ${bleed} mm`);
}

fs.mkdirSync(outDir, { recursive: true });
buildLona({ file: "LONA-DADIVA-2X2M.pdf", bleed: 0 });
buildLona({ file: "LONA-DADIVA-2X2M-COM-SANGRIA-30MM.pdf", bleed: 30 });
