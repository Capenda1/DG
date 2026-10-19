import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "marketing", "logo");
const source = process.argv[2] ?? path.join(outDir, "logo-dg-monograma.png");

/** Lê largura/altura e pixels de um PNG 8-bit não entrelaçado (só para medir). */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG inválido.");

  let offset = 8;
  let meta = null;
  const idat = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      meta = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (!meta) throw new Error("IHDR ausente.");
  if (meta.bitDepth !== 8 || meta.interlace !== 0) {
    throw new Error(`Formato não suportado (bitDepth ${meta.bitDepth}).`);
  }

  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[meta.colorType];
  if (!channels) throw new Error(`colorType ${meta.colorType} não suportado.`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = meta.width * channels;
  const pixels = Buffer.alloc(stride * meta.height);

  for (let row = 0; row < meta.height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const out = pixels.subarray(row * stride, (row + 1) * stride);
    const prev = row === 0 ? null : pixels.subarray((row - 1) * stride, row * stride);

    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = value & 0xff;
    }
  }

  return { ...meta, channels, pixels };
}

/** Caixa dos pixels visíveis (ignora o fundo preto em volta do emblema). */
function findArtBounds(image, threshold = 55) {
  const { width, height, channels, pixels } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const alpha = channels === 4 ? pixels[i + 3] : channels === 2 ? pixels[i + 1] : 255;
      if (alpha < 16) continue;
      const r = pixels[i];
      const g = channels >= 3 ? pixels[i + 1] : r;
      const b = channels >= 3 ? pixels[i + 2] : r;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("Não encontrei arte visível na imagem.");
  return { minX, minY, maxX, maxY };
}

const image = decodePng(source);
const bounds = findArtBounds(image);
const artW = bounds.maxX - bounds.minX + 1;
const artH = bounds.maxY - bounds.minY + 1;
const diameterPx = Math.max(artW, artH);
const centerXPx = (bounds.minX + bounds.maxX + 1) / 2;
const centerYPx = (bounds.minY + bounds.maxY + 1) / 2;

const base64 = fs.readFileSync(source).toString("base64");
const imageData = `data:image/png;base64,${base64}`;

/**
 * Desenha o emblema recortado num círculo perfeito.
 * O clip é vectorial: as pontas ficam fora do círculo, sem moldura quadrada.
 */
function buildPdf({ file, diameterMm, pageMm, bleedMm = 0 }) {
  const page = pageMm ?? diameterMm;
  const doc = new jsPDF({
    unit: "mm",
    format: [page, page],
    compress: true,
  });

  const cx = page / 2;
  const cy = page / 2;
  const radius = diameterMm / 2;

  // Escala: o diâmetro da arte passa a valer diameterMm (+ bleed).
  const scale = (diameterMm + bleedMm * 2) / diameterPx;
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawX = cx - centerXPx * scale;
  const drawY = cy - centerYPx * scale;

  doc.saveGraphicsState();
  doc.circle(cx, cy, radius, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(imageData, "PNG", drawX, drawY, drawW, drawH, undefined, "NONE");
  doc.restoreGraphicsState();

  const target = path.join(outDir, file);
  doc.save(target);

  const dpi = diameterPx / (diameterMm / 25.4);
  console.log(
    `${file} · círculo ${diameterMm}mm · página ${page}mm · ${dpi.toFixed(0)} DPI`,
  );
}

fs.mkdirSync(outDir, { recursive: true });

console.log(
  `Fonte: ${path.basename(source)} (${image.width}x${image.height}) · arte ${artW}x${artH}px`,
);

// 300 DPI reais (qualidade máxima sem interpolar).
buildPdf({ file: "LOGO-DG-CIRCULAR-75MM-300DPI.pdf", diameterMm: 75, bleedMm: 0.3 });

// Versão maior para cartazes/vinil (mantém nitidez em leitura à distância).
buildPdf({ file: "LOGO-DG-CIRCULAR-150MM.pdf", diameterMm: 150, bleedMm: 0.5 });

// A4 centrado para prova de impressão.
buildPdf({
  file: "LOGO-DG-CIRCULAR-A4.pdf",
  diameterMm: 120,
  pageMm: 210,
  bleedMm: 0.4,
});
