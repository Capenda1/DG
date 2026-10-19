import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { decodePng, measureCircularArt } from "./lib/png-bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketing = path.join(root, "docs", "marketing");
const outDir = path.join(marketing, "lona");
const assets = path.join(marketing, "assets");

const SIDE = 2000; // lona 2 m × 2 m (mm)
const MARGIN = 55;
const GUTTER = 14;

const GOLD = [224, 171, 53];
const GOLD_DEEP = [166, 116, 20];
const BLACK = [12, 12, 14];
const PANEL = [23, 23, 26];
const WHITE = [255, 255, 255];
const SOFT = [205, 205, 210];

const logoFile = path.join(marketing, "logo", "logo-dg-monograma.png");
const logo = measureCircularArt(logoFile);
const logoData = `data:image/png;base64,${fs.readFileSync(logoFile).toString("base64")}`;

function loadPhoto(file) {
  const full = path.join(assets, file);
  const { width, height } = decodePng(full);
  return {
    width,
    height,
    data: `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`,
  };
}

const photoPerson = loadPhoto("lona-panel-pessoa.png");
const photoProducts = loadPhoto("lona-panel-produtos.png");

function fitFontSize(doc, text, maxWidth, startSize) {
  let size = startSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(text) > maxWidth && size > 6) {
    size -= 1;
    doc.setFontSize(size);
  }
  return size;
}

function text(doc, value, x, y, opts = {}) {
  const {
    size = 100,
    style = "bold",
    color = WHITE,
    align = "left",
    maxWidth = null,
  } = opts;
  doc.setFont("helvetica", style);
  doc.setTextColor(...color);
  if (maxWidth) fitFontSize(doc, value, maxWidth, size);
  else doc.setFontSize(size);
  doc.text(value, x, y, { align });
}

/** Preenche o rectângulo com a foto (cover) recortada, sem distorcer. */
function coverPhoto(doc, photo, x, y, w, h) {
  const scale = Math.max(w / photo.width, h / photo.height);
  const drawW = photo.width * scale;
  const drawH = photo.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;

  doc.saveGraphicsState();
  doc.rect(x, y, w, h, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(photo.data, "PNG", drawX, drawY, drawW, drawH, undefined, "NONE");
  doc.restoreGraphicsState();

  const dpi = Math.min(photo.width / (w / 25.4), photo.height / (h / 25.4));
  return dpi;
}

function logoCircle(doc, cx, cy, diameter) {
  const r = diameter / 2;
  const scale = (diameter + 4) / logo.diameterPx;
  doc.saveGraphicsState();
  doc.circle(cx, cy, r, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(
    logoData,
    "PNG",
    cx - logo.centerXPx * scale,
    cy - logo.centerYPx * scale,
    logo.image.width * scale,
    logo.image.height * scale,
    undefined,
    "NONE",
  );
  doc.restoreGraphicsState();
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(5);
  doc.circle(cx, cy, r, "S");
}

function goldPill(doc, label, cx, topY, height, maxWidth) {
  doc.setFont("helvetica", "bold");
  const size = fitFontSize(doc, label, maxWidth - 130, 300);
  const width = Math.min(maxWidth, doc.getTextWidth(label) + 150);
  doc.setFillColor(...GOLD);
  doc.roundedRect(cx - width / 2, topY, width, height, height / 2, height / 2, "F");
  doc.setTextColor(...BLACK);
  doc.setFontSize(size);
  doc.text(label, cx, topY + height / 2 + size * 0.25 * 0.3528, { align: "center" });
}

function build({ file, bleed }) {
  const page = SIDE + bleed * 2;
  const doc = new jsPDF({ unit: "mm", format: [page, page], compress: true });
  const o = bleed;
  const report = [];

  doc.setFillColor(...BLACK);
  doc.rect(0, 0, page, page, "F");

  const left = o + MARGIN;
  const right = o + SIDE - MARGIN;
  const innerW = right - left;

  // ── Faixa superior: emblema + headline ────────────────────────
  const headTop = o + MARGIN;
  const headH = 430;
  doc.setFillColor(...PANEL);
  doc.rect(left, headTop, innerW, headH, "F");
  doc.setDrawColor(...GOLD_DEEP);
  doc.setLineWidth(4);
  doc.rect(left, headTop, innerW, headH, "S");

  logoCircle(doc, left + 235, headTop + headH / 2, 330);

  const headTextX = left + 450;
  const headTextMax = innerW - 490;
  text(doc, "A sua ideia.", headTextX, headTop + 195, {
    size: 320,
    color: WHITE,
    maxWidth: headTextMax,
  });
  text(doc, "Na sua peça.", headTextX, headTop + 365, {
    size: 320,
    color: GOLD,
    maxWidth: headTextMax,
  });

  // ── Linha do meio: foto + passos ──────────────────────────────
  const midTop = headTop + headH + GUTTER;
  const midH = 570;
  const photoW = Math.round(innerW * 0.52);
  const stepsX = left + photoW + GUTTER;
  const stepsW = innerW - photoW - GUTTER;

  report.push(`foto pessoa ${coverPhoto(doc, photoPerson, left, midTop, photoW, midH).toFixed(0)} DPI`);

  doc.setFillColor(...PANEL);
  doc.rect(stepsX, midTop, stepsW, midH, "F");
  text(doc, "DO ECRÃ AO TECIDO", stepsX + 55, midTop + 88, {
    size: 72,
    color: GOLD,
    maxWidth: stepsW - 110,
  });

  const steps = [
    ["01", "Escolha o produto"],
    ["02", "Envie a sua arte"],
    ["03", "Receba a sua peça"],
  ];
  steps.forEach(([num, label], i) => {
    const y = midTop + 215 + i * 135;
    text(doc, num, stepsX + 55, y, { size: 175, color: GOLD });
    text(doc, label, stepsX + 265, y - 18, {
      size: 95,
      color: WHITE,
      maxWidth: stepsW - 320,
    });
    if (i < steps.length - 1) {
      doc.setDrawColor(...GOLD_DEEP);
      doc.setLineWidth(2.5);
      doc.line(stepsX + 55, y + 42, stepsX + stepsW - 55, y + 42);
    }
  });

  // ── Terceira linha: produtos + bloco empresas ─────────────────
  const rowTop = midTop + midH + GUTTER;
  const rowH = 505;

  report.push(`foto produtos ${coverPhoto(doc, photoProducts, left, rowTop, photoW, rowH).toFixed(0)} DPI`);

  const bizX = left + photoW + GUTTER;
  const bizW = innerW - photoW - GUTTER;
  doc.setFillColor(...GOLD);
  doc.rect(bizX, rowTop, bizW, rowH, "F");
  text(doc, "Uniformes", bizX + 55, rowTop + 160, {
    size: 195,
    color: BLACK,
    maxWidth: bizW - 110,
  });
  text(doc, "e equipas", bizX + 55, rowTop + 300, {
    size: 195,
    color: BLACK,
    maxWidth: bizW - 110,
  });
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(4);
  doc.line(bizX + 55, rowTop + 350, bizX + bizW - 55, rowTop + 350);
  text(doc, "A sua marca, vestida de verdade.", bizX + 55, rowTop + 415, {
    size: 82,
    style: "normal",
    color: BLACK,
    maxWidth: bizW - 110,
  });
  text(doc, "Pedir orçamento", bizX + 55, rowTop + 475, {
    size: 82,
    color: BLACK,
    maxWidth: bizW - 110,
  });

  // ── CTA + rodapé ──────────────────────────────────────────────
  const ctaTop = rowTop + rowH + GUTTER + 8;
  const ctaH = 125;
  goldPill(doc, "COMEÇAR O MEU PEDIDO", o + SIDE / 2, ctaTop, ctaH, innerW * 0.62);

  const footY = ctaTop + ctaH + 88;
  text(doc, "T-shirts  ·  Polos  ·  Coletes  ·  Bonés  ·  Lonas", left, footY, {
    size: 78,
    style: "normal",
    color: SOFT,
  });
  text(doc, "graficadadiva.com", right, footY, {
    size: 112,
    color: GOLD,
    align: "right",
  });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(8);
  const ruleY = footY + 42;
  doc.line(left, ruleY, right, ruleY);

  const safeBottom = o + SIDE - MARGIN;
  if (ruleY > safeBottom) {
    throw new Error(
      `Layout excede a área útil: ${ruleY.toFixed(0)}mm > ${safeBottom.toFixed(0)}mm.`,
    );
  }

  const target = path.join(outDir, file);
  doc.save(target);
  console.log(
    `${file} · ${page}×${page} mm · sangria ${bleed} mm · ${report.join(" · ")} · folga inferior ${(safeBottom - ruleY).toFixed(0)} mm`,
  );
}

fs.mkdirSync(outDir, { recursive: true });
build({ file: "LONA-DADIVA-CRIATIVA-2X2M.pdf", bleed: 0 });
build({ file: "LONA-DADIVA-CRIATIVA-2X2M-SANGRIA-30MM.pdf", bleed: 30 });
