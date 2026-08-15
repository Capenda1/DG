/**
 * Prepara um mockup de vestuário para o viewer 2D da modelagem.
 *
 * Entrada : foto frente+costas lado a lado, fundo branco, peça de cor única.
 * Saída   : PNG RGBA com fundo transparente e peça neutralizada (branco com
 *           sombras preservadas), pronta para tingir por `multiply`.
 *
 * O viewer parte a imagem a 50 % (esquerda = frente, direita = costas), por isso
 * as duas vistas são recentradas em metades exactas.
 *
 * Requer o `sharp` que vem com o Next (não é dependência directa do projecto).
 *
 * Uso:
 *   node scripts/prepare-garment-mockup.mjs <entrada> <saida> \
 *     [--width=2400] [--shadow=1.1] [--frame-aspect=0.707] [--fit=0.8] [--recenter=false]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/* Fundo = claro e sem cor; a peça (amarela) tem saturação alta. */
const BG_MIN_LEVEL = 232;
const BG_MAX_CHROMA = 26;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const [key, value = "true"] = arg.slice(2).split("=");
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/** Marca como fundo apenas o branco ligado à borda (preserva fechos claros). */
function floodFillBackground(data, width, height) {
  const total = width * height;
  const isBackground = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;

  const isCandidate = (px) => {
    const o = px * 4;
    if (data[o + 3] < 16) return true;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max >= BG_MIN_LEVEL && max - min <= BG_MAX_CHROMA;
  };

  const push = (px) => {
    if (isBackground[px] || !isCandidate(px)) return;
    isBackground[px] = 1;
    stack[top++] = px;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (top > 0) {
    const px = stack[--top];
    const x = px % width;
    const y = (px - x) / width;
    if (x > 0) push(px - 1);
    if (x < width - 1) push(px + 1);
    if (y > 0) push(px - width);
    if (y < height - 1) push(px + width);
  }

  return isBackground;
}

/** Nível neutro por pixel: canal máximo (HSV value) remove a matiz da peça. */
function neutralLevel(data, px) {
  const o = px * 4;
  return Math.max(data[o], data[o + 1], data[o + 2]);
}

function percentile(values, ratio) {
  if (!values.length) return 255;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * ratio)),
  );
  return sorted[idx];
}

/** Suaviza a borda do recorte com uma média 3×3 no canal alfa. */
function softenAlpha(out, width, height) {
  const alpha = new Uint8Array(width * height);
  for (let px = 0; px < width * height; px++) alpha[px] = out[px * 4 + 3];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = y * width + x;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += alpha[ny * width + nx];
          count++;
        }
      }
      out[px * 4 + 3] = Math.round(sum / count);
    }
  }
}

/** Caixa envolvente dos pixels opacos numa faixa de colunas. */
function boundingBox(out, width, height, fromX, toX) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = fromX; x < toX; x++) {
      if (out[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Coluna vazia mais central: separa a vista da frente da vista de costas. */
function findSplitColumn(out, width, height) {
  const empty = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    let opaque = 0;
    for (let y = 0; y < height; y++) {
      if (out[(y * width + x) * 4 + 3] > 8) {
        opaque = 1;
        break;
      }
    }
    empty[x] = opaque ? 0 : 1;
  }

  const middle = Math.floor(width / 2);
  let best = null;
  let runStart = -1;
  for (let x = 0; x <= width; x++) {
    if (x < width && empty[x]) {
      if (runStart < 0) runStart = x;
      continue;
    }
    if (runStart >= 0) {
      const center = (runStart + x - 1) / 2;
      const distance = Math.abs(center - middle);
      /* Ignora as margens exteriores da imagem. */
      const interior = runStart > 0 && x < width;
      if (interior && (!best || distance < best.distance)) {
        best = { center: Math.round(center), distance };
      }
      runStart = -1;
    }
  }
  return best ? best.center : middle;
}

/**
 * Reconstrói o canvas com frente e costas centradas em metades iguais.
 *
 * `frameAspect` e `fit` reproduzem o enquadramento do asset anterior: o viewer
 * posiciona a arte num quadrado central independente da peça, por isso mudar a
 * proporção da moldura deslocaria desenhos já guardados.
 */
async function recenterViews(out, width, height, { frameAspect, fit }) {
  const split = findSplitColumn(out, width, height);
  const front = boundingBox(out, width, height, 0, split);
  const back = boundingBox(out, width, height, split, width);
  if (!front || !back) return { buffer: out, width, height, recentered: false };

  const viewW = Math.max(front.width, back.width);
  const viewH = Math.max(front.height, back.height);
  const outH = Math.round(viewH / fit);
  const halfW = Math.max(Math.round(outH * frameAspect), viewW);
  const outW = halfW * 2;

  const source = await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  const crop = async (box) =>
    sharp(source)
      .extract(box)
      .png()
      .toBuffer();

  const canvas = sharp({
    create: {
      width: outW,
      height: outH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  });

  const composed = await canvas
    .composite([
      {
        input: await crop(front),
        left: Math.round((halfW - front.width) / 2),
        top: Math.round((outH - front.height) / 2),
      },
      {
        input: await crop(back),
        left: halfW + Math.round((halfW - back.width) / 2),
        top: Math.round((outH - back.height) / 2),
      },
    ])
    .raw()
    .toBuffer();

  return { buffer: composed, width: outW, height: outH, recentered: true };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [input, output] = positional;
  if (!input || !output) {
    console.error(
      "Uso: node scripts/prepare-garment-mockup.mjs <entrada> <saida> [--width=2400] [--shadow=1.1]",
    );
    process.exit(1);
  }

  const targetWidth = flags.width ? Number(flags.width) : 0;
  const shadow = flags.shadow ? Number(flags.shadow) : 1;

  let pipeline = sharp(readFileSync(path.resolve(input))).ensureAlpha();
  if (targetWidth > 0) {
    pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
  }

  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const total = width * height;

  const isBackground = floodFillBackground(data, width, height);

  const levels = [];
  for (let px = 0; px < total; px++) {
    if (!isBackground[px]) levels.push(neutralLevel(data, px));
  }
  /* Normaliza para que as zonas mais claras da peça fiquem brancas. */
  const highlight = Math.max(1, percentile(levels, 0.98));
  const gain = 255 / highlight;

  const out = Buffer.alloc(total * 4);
  for (let px = 0; px < total; px++) {
    const o = px * 4;
    if (isBackground[px]) {
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = 0;
      continue;
    }
    const normalized = Math.min(255, neutralLevel(data, px) * gain);
    const shaded = 255 - (255 - normalized) * shadow;
    const value = Math.max(0, Math.min(255, Math.round(shaded)));
    out[o] = value;
    out[o + 1] = value;
    out[o + 2] = value;
    out[o + 3] = 255;
  }

  softenAlpha(out, width, height);

  const centered =
    flags.recenter === "false"
      ? { buffer: out, width, height, recentered: false }
      : await recenterViews(out, width, height, {
          frameAspect: flags["frame-aspect"]
            ? Number(flags["frame-aspect"])
            : 0.707,
          fit: flags.fit ? Number(flags.fit) : 0.8,
        });

  const png = await sharp(centered.buffer, {
    raw: { width: centered.width, height: centered.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const outPath = path.resolve(output);
  writeFileSync(outPath, png);

  console.log(
    `${path.basename(outPath)}: ${centered.width}x${centered.height}` +
      `${centered.recentered ? " (vistas recentradas)" : ""}, ` +
      `highlight=${highlight.toFixed(0)}, ${(png.length / 1024).toFixed(0)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
