import fs from "node:fs";
import zlib from "node:zlib";

/** Lê largura/altura e pixels de um PNG 8-bit não entrelaçado (apenas para medir). */
export function decodePng(file) {
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

/** Caixa dos pixels visíveis (ignora o fundo escuro em volta da arte). */
export function findArtBounds(image, threshold = 55) {
  const { width, height, channels, pixels } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const alpha =
        channels === 4 ? pixels[i + 3] : channels === 2 ? pixels[i + 1] : 255;
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

/** Centro e diâmetro (px) da arte circular dentro do PNG. */
export function measureCircularArt(file, threshold = 55) {
  const image = decodePng(file);
  const bounds = findArtBounds(image, threshold);
  const artW = bounds.maxX - bounds.minX + 1;
  const artH = bounds.maxY - bounds.minY + 1;
  return {
    image,
    artW,
    artH,
    diameterPx: Math.max(artW, artH),
    centerXPx: (bounds.minX + bounds.maxX + 1) / 2,
    centerYPx: (bounds.minY + bounds.maxY + 1) / 2,
  };
}
