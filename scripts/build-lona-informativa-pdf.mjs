import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { decodePng, measureCircularArt } from "./lib/png-bounds.mjs";
import { qrRuns } from "./lib/qr-vector.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketing = path.join(root, "docs", "marketing");
const outDir = path.join(marketing, "lona");
const assets = path.join(marketing, "assets");

const SIDE = 2000; // 2 m × 2 m
const MARGIN = 55;
const GUTTER = 14;
const SITE_URL = "https://graficadadiva.com";

const GOLD = [224, 171, 53];
const GOLD_DEEP = [166, 116, 20];
const GRID = [46, 36, 14];
const BLACK = [12, 12, 14];
const PANEL = [23, 23, 26];
const WHITE = [255, 255, 255];
const SOFT = [206, 206, 212];

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

function fit(doc, value, maxWidth, startSize) {
  let size = startSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(value) > maxWidth && size > 6) {
    size -= 1;
    doc.setFontSize(size);
  }
  return size;
}

function text(doc, value, x, y, opts = {}) {
  const { size = 80, style = "bold", color = WHITE, align = "left", maxWidth = null } = opts;
  doc.setFont("helvetica", style);
  doc.setTextColor(...color);
  if (maxWidth) fit(doc, value, maxWidth, size);
  else doc.setFontSize(size);
  doc.text(value, x, y, { align });
}

const mm = (pt) => pt * 0.3528;

function panel(doc, x, y, w, h, { fill = PANEL, border = null } = {}) {
  doc.setFillColor(...fill);
  doc.rect(x, y, w, h, "F");
  if (border) {
    doc.setDrawColor(...border);
    doc.setLineWidth(3);
    doc.rect(x, y, w, h, "S");
  }
}

function sectionTitle(doc, label, x, y, maxWidth) {
  text(doc, label, x, y, { size: 78, color: GOLD, maxWidth });
  doc.setDrawColor(...GOLD_DEEP);
  doc.setLineWidth(3);
  doc.line(x, y + 26, x + maxWidth, y + 26);
}

/** Lista com marcador quadrado dourado; devolve o Y final. */
function bulletList(doc, items, x, y, maxWidth, opts = {}) {
  const { size = 60, gap = 82, color = WHITE } = opts;
  let cursor = y;
  for (const item of items) {
    doc.setFillColor(...GOLD);
    doc.rect(x, cursor - mm(size) * 0.42, 16, 16, "F");
    const isPair = Array.isArray(item);
    const label = isPair ? item[0] : item;
    text(doc, label, x + 38, cursor, { size, color, maxWidth: maxWidth - 38 });
    cursor += gap;
    if (isPair) {
      text(doc, item[1], x + 38, cursor - 30, {
        size: 46,
        style: "normal",
        color: SOFT,
        maxWidth: maxWidth - 38,
      });
      cursor += 22;
    }
  }
  return cursor;
}

function logoCircle(doc, cx, cy, diameter) {
  const scale = (diameter + 4) / logo.diameterPx;
  doc.saveGraphicsState();
  doc.circle(cx, cy, diameter / 2, null);
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
  doc.circle(cx, cy, diameter / 2, "S");
}

function coverPhoto(doc, photo, x, y, w, h) {
  const scale = Math.max(w / photo.width, h / photo.height);
  const drawW = photo.width * scale;
  const drawH = photo.height * scale;
  doc.saveGraphicsState();
  doc.rect(x, y, w, h, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(
    photo.data,
    "PNG",
    x + (w - drawW) / 2,
    y + (h - drawH) / 2,
    drawW,
    drawH,
    undefined,
    "NONE",
  );
  doc.restoreGraphicsState();
  return Math.min(photo.width / (w / 25.4), photo.height / (h / 25.4));
}

/** QR desenhado como vector, a partir dos mesmos runs que o teste valida. */
function vectorQr(doc, qr, x, y, size) {
  const { count, runs } = qrRuns(qr);
  const cell = size / count;
  doc.setFillColor(0, 0, 0);
  for (const { row, col, len } of runs) {
    doc.rect(x + col * cell, y + row * cell, len * cell + 0.12, cell + 0.12, "F");
  }
}

function qrCard(doc, qr, x, y, width, { caption, sub }) {
  const quiet = 30;
  const qrSize = width - quiet * 2;
  const captionH = 100;
  const height = qrSize + quiet * 2 + captionH;

  doc.setFillColor(...WHITE);
  doc.roundedRect(x, y, width, height, 20, 20, "F");
  vectorQr(doc, qr, x + quiet, y + quiet, qrSize);

  const capY = y + quiet + qrSize + 50;
  text(doc, caption, x + width / 2, capY, {
    size: 50,
    color: BLACK,
    align: "center",
    maxWidth: width - 40,
  });
  text(doc, sub, x + width / 2, capY + 42, {
    size: 40,
    style: "normal",
    color: [70, 70, 74],
    align: "center",
    maxWidth: width - 40,
  });
  return height;
}

function blackPill(doc, label, x, y, height, maxWidth) {
  doc.setFont("helvetica", "bold");
  const size = fit(doc, label, maxWidth - 90, 70);
  const width = Math.min(maxWidth, doc.getTextWidth(label) + 110);
  doc.setFillColor(...BLACK);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  doc.setTextColor(...GOLD);
  doc.setFontSize(size);
  doc.text(label, x + width / 2, y + height / 2 + mm(size) * 0.35, { align: "center" });
}

function build({ file, bleed, qr }) {
  const page = SIDE + bleed * 2;
  const doc = new jsPDF({ unit: "mm", format: [page, page], compress: true });
  const o = bleed;
  const notes = [];

  doc.setFillColor(...BLACK);
  doc.rect(0, 0, page, page, "F");

  // Textura técnica ténue, discreta o suficiente para não competir com o texto.
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.8);
  for (let g = 100; g < SIDE; g += 100) {
    doc.line(o + g, o, o + g, o + SIDE);
    doc.line(o, o + g, o + SIDE, o + g);
  }

  const left = o + MARGIN;
  const right = o + SIDE - MARGIN;
  const innerW = right - left;

  // ── 1. Hero: emblema + headline + QR ──────────────────────────
  const heroTop = o + MARGIN;
  const heroH = 410;

  logoCircle(doc, left + 175, heroTop + 175, 310);

  const qrW = 340;
  const qrX = right - qrW;
  const qrH = qrCard(doc, qr, qrX, heroTop, qrW, {
    caption: "Aponte a câmara",
    sub: "e faça o seu pedido",
  });

  const hx = left + 400;
  const hMax = qrX - hx - 60;
  text(doc, "A sua ideia.", hx, heroTop + 150, { size: 240, color: WHITE, maxWidth: hMax });
  text(doc, "Na sua peça.", hx, heroTop + 285, { size: 240, color: GOLD, maxWidth: hMax });
  text(doc, "Peça, acompanhe e receba — tudo a partir do telefone.", hx, heroTop + 375, {
    size: 66,
    style: "normal",
    color: SOFT,
    maxWidth: hMax,
  });

  // ── 2. Linha do tempo: as 6 fases reais do pedido ─────────────
  const tlTop = Math.max(heroTop + heroH, heroTop + qrH) + GUTTER + 18;
  const tlH = 350;
  panel(doc, left, tlTop, innerW, tlH, { border: GOLD_DEEP });
  sectionTitle(doc, "O SEU PEDIDO, FASE A FASE", left + 45, tlTop + 80, innerW - 90);

  const phases = [
    "Submetido",
    "Validação e pagamento",
    "Aprovado",
    "Em produção",
    "Finalizado",
    "Entregue",
  ];
  const nodeY = tlTop + 210;
  const step = innerW / phases.length;
  const firstCx = left + step / 2;
  const lastCx = left + step * (phases.length - 0.5);

  doc.setDrawColor(...GOLD_DEEP);
  doc.setLineWidth(14);
  doc.line(firstCx, nodeY, lastCx, nodeY);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(5);
  doc.line(firstCx, nodeY, lastCx, nodeY);

  phases.forEach((label, i) => {
    const cx = left + step * (i + 0.5);
    doc.setFillColor(...GOLD);
    doc.circle(cx, nodeY, 55, "F");
    text(doc, String(i + 1).padStart(2, "0"), cx, nodeY + 18, {
      size: 92,
      color: BLACK,
      align: "center",
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(58);
    const lines = doc.splitTextToSize(label, step - 60);
    lines.forEach((line, li) => {
      text(doc, line, cx, nodeY + 130 + li * 62, { size: 58, color: WHITE, align: "center" });
    });
  });

  // ── 3. Três colunas informativas ──────────────────────────────
  const infoTop = tlTop + tlH + GUTTER;
  const infoH = 540;
  const colW = (innerW - GUTTER * 2) / 3;

  const colA = left;
  panel(doc, colA, infoTop, colW, infoH);
  sectionTitle(doc, "O QUE PERSONALIZAMOS", colA + 40, infoTop + 78, colW - 80);
  bulletList(
    doc,
    [
      "T-shirts, polos e coletes",
      "Bonés",
      "Canecas",
      "Cartões de visita",
      "Passes PVC e carimbos",
      "Lonas e vinil",
    ],
    colA + 40,
    infoTop + 175,
    colW - 80,
    { gap: 60, size: 56 },
  );

  const colB = colA + colW + GUTTER;
  panel(doc, colB, infoTop, colW, infoH);
  sectionTitle(doc, "COMO IMPRIMIMOS", colB + 40, infoTop + 78, colW - 80);
  bulletList(
    doc,
    [
      ["Sublimação", "Cores vivas em tecidos claros"],
      ["DTF", "Alta cobertura, ideal em cores escuras"],
      ["Cor e tamanho à escolha", "Escolhe na matriz do produto"],
      ["Envie a sua arte", "Ou peça à nossa equipa de design"],
    ],
    colB + 40,
    infoTop + 175,
    colW - 80,
    { gap: 60, size: 56 },
  );

  const colC = colB + colW + GUTTER;
  panel(doc, colC, infoTop, colW, infoH);
  sectionTitle(doc, "PREÇO E PAGAMENTO", colC + 40, infoTop + 78, colW - 80);
  bulletList(
    doc,
    [
      ["Preço calculado na hora", "Preço da variante × quantidade"],
      ["Lonas e vinil ao metro quadrado", "Altura × largura × preço/m²"],
      ["Preços em Kwanza (AOA)", "Transferência, depósito ou na loja"],
      ["Mensagens com a equipa", "Dentro do próprio pedido"],
    ],
    colC + 40,
    infoTop + 175,
    colW - 80,
    { gap: 60, size: 56 },
  );

  // ── 4. Prova visual + bloco empresas ──────────────────────────
  const rowTop = infoTop + infoH + GUTTER;
  const rowH = 360;
  const photoW = Math.round(innerW * 0.5);
  notes.push(`foto ${coverPhoto(doc, photoPerson, left, rowTop, photoW, rowH).toFixed(0)} DPI`);

  const bizX = left + photoW + GUTTER;
  const bizW = innerW - photoW - GUTTER;
  panel(doc, bizX, rowTop, bizW, rowH, { fill: GOLD });
  text(doc, "Uniformes e equipas", bizX + 55, rowTop + 118, {
    size: 138,
    color: BLACK,
    maxWidth: bizW - 110,
  });
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(4);
  doc.line(bizX + 55, rowTop + 156, bizX + bizW - 55, rowTop + 156);
  text(doc, "A sua marca, vestida de verdade.", bizX + 55, rowTop + 218, {
    size: 68,
    style: "normal",
    color: BLACK,
    maxWidth: bizW - 110,
  });
  blackPill(doc, "PEDIR ORÇAMENTO", bizX + 55, rowTop + 248, 95, bizW - 110);

  // ── 5. Rodapé ─────────────────────────────────────────────────
  const footTop = rowTop + rowH + GUTTER;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(8);
  doc.line(left, footTop + 8, right, footTop + 8);
  const footY = footTop + 88;
  text(doc, "Peça pelo telefone. Receba na mão.", left, footY, {
    size: 70,
    style: "normal",
    color: SOFT,
  });
  text(doc, "graficadadiva.com", right, footY, { size: 118, color: GOLD, align: "right" });

  const safeBottom = o + SIDE - MARGIN;
  if (footY > safeBottom) {
    throw new Error(`Layout excede a área útil: ${footY.toFixed(0)} > ${safeBottom.toFixed(0)} mm.`);
  }

  doc.save(path.join(outDir, file));
  console.log(
    `${file} · ${page}×${page} mm · sangria ${bleed} mm · QR ${qr.modules.size} módulos vectoriais · ${notes.join(" · ")} · folga inferior ${(safeBottom - footY).toFixed(0)} mm`,
  );
}

const qr = QRCode.create(SITE_URL, { errorCorrectionLevel: "H" });
fs.mkdirSync(outDir, { recursive: true });
build({ file: "LONA-DADIVA-INFO-2X2M.pdf", bleed: 0, qr });
build({ file: "LONA-DADIVA-INFO-2X2M-SANGRIA-30MM.pdf", bleed: 30, qr });
