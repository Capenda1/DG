/**
 * Melhoramento de fotos raster no browser (sem servidor).
 *
 * Pipeline: contraste apenas em luminância (cores mais estáveis que auto-níveis por canal),
 * gamma leve em midtones, denoise muito suave, unsharp só em luminância (menos halos de cor),
 * e ampliação em vários passos + nitidez final leve no tamanho de saída.
 *
 * Danos graves ou falta total de textura continuam a exigir modelos de IA externos.
 */

export type RestoreImageStrength = "subtle" | "normal" | "strong";

export type RestoreImageQualityOptions = {
  upscaleFactor: 1 | 1.5 | 2;
  strength: RestoreImageStrength;
};

const MAX_INPUT_PIXELS = 14_000_000;
const MAX_OUTPUT_SIDE = 8192;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function luminanceHistogramPercentiles(
  data: Uint8ClampedArray,
  fracEnds: number,
): [number, number] {
  const hist = new Uint32Array(256);
  const n = data.length >> 2;
  for (let i = 0; i < n; i++) {
    const o = i << 2;
    const y = clamp(
      Math.round(
        0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!,
      ),
      0,
      255,
    );
    hist[y]++;
  }
  const lowCut = Math.max(1, Math.floor(n * fracEnds));
  const highCut = Math.max(1, Math.floor(n * fracEnds));
  let acc = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (acc >= lowCut) {
      lo = i;
      break;
    }
  }
  acc = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]!;
    if (acc >= highCut) {
      hi = i;
      break;
    }
  }
  if (hi <= lo) hi = lo + 1;
  return [lo, hi];
}

function stretchLuminanceKeepChroma(
  data: Uint8ClampedArray,
  loY: number,
  hiY: number,
): void {
  const denom = hiY - loY;
  const maxRatio = 2.85;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const yStretch = clamp(((y - loY) / denom) * 255, 0, 255);
    const ratio =
      Math.min(maxRatio, yStretch / Math.max(y, 1.5));
    data[i] = clamp(Math.round(r * ratio), 0, 255);
    data[i + 1] = clamp(Math.round(g * ratio), 0, 255);
    data[i + 2] = clamp(Math.round(b * ratio), 0, 255);
  }
}

function liftMidtonesGamma(data: Uint8ClampedArray, exponent: number): void {
  if (Math.abs(exponent - 1) < 1e-3) return;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const x = data[i + c]! / 255;
      data[i + c] = clamp(Math.round(Math.pow(x, exponent) * 255), 0, 255);
    }
  }
}

function boxBlurRgbInPlaceSeparate(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  r: number,
): void {
  const src = new Uint8ClampedArray(d);
  const tmp = new Uint8ClampedArray(d.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = clamp(x + dx, 0, w - 1);
        const j = (y * w + xx) << 2;
        sr += src[j]!;
        sg += src[j + 1]!;
        sb += src[j + 2]!;
        n++;
      }
      const o = (y * w + x) << 2;
      tmp[o] = sr / n;
      tmp[o + 1] = sg / n;
      tmp[o + 2] = sb / n;
      tmp[o + 3] = src[o + 3]!;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        const j = (yy * w + x) << 2;
        sr += tmp[j]!;
        sg += tmp[j + 1]!;
        sb += tmp[j + 2]!;
        n++;
      }
      const o = (y * w + x) << 2;
      d[o] = sr / n;
      d[o + 1] = sg / n;
      d[o + 2] = sb / n;
      d[o + 3] = tmp[o + 3]!;
    }
  }
}

/** Mistura borrada trivial para granularidade alta antes da nitidez. */
function softenNoiseRgb(data: Uint8ClampedArray, w: number, h: number, mix: number): void {
  if (mix <= 0) return;
  const orig = new Uint8ClampedArray(data);
  const blur = new Uint8ClampedArray(data.length);
  blur.set(orig);
  boxBlurRgbInPlaceSeparate(blur, w, h, 1);
  const om = 1 - mix;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(
      Math.round(orig[i]! * om + blur[i]! * mix),
      0,
      255,
    );
    data[i + 1] = clamp(
      Math.round(orig[i + 1]! * om + blur[i + 1]! * mix),
      0,
      255,
    );
    data[i + 2] = clamp(
      Math.round(orig[i + 2]! * om + blur[i + 2]! * mix),
      0,
      255,
    );
  }
}

function fillLuminanceFromRgb(data: Uint8ClampedArray, L: Float32Array): void {
  const n = data.length >> 2;
  for (let i = 0; i < n; i++) {
    const o = i << 2;
    L[i] =
      0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }
}

function boxBlurGray(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
): void {
  const tmp = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = clamp(x + dx, 0, w - 1);
        s += src[y * w + xx]!;
        c++;
      }
      tmp[y * w + x] = s / c;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        s += tmp[yy * w + x]!;
        c++;
      }
      dst[y * w + x] = s / c;
    }
  }
}

function blurLMultiPass(
  L: Float32Array,
  w: number,
  h: number,
  radii: readonly number[],
): Float32Array {
  let cur = new Float32Array(L);
  let blurred = new Float32Array(L.length);

  for (const r of radii) {
    boxBlurGray(cur, blurred, w, h, r);
    const swap = cur;
    cur = blurred;
    blurred = swap;
  }
  return cur;
}

function unsharpLuminanceRgb(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  blurRadii: readonly number[],
  amount: number,
  ratioClamp: [number, number],
): void {
  const n = w * h;
  const L = new Float32Array(n);
  fillLuminanceFromRgb(data, L);
  const Lblur = blurLMultiPass(L, w, h, blurRadii);
  const [rLo, rHi] = ratioClamp;
  const eps = 2;

  for (let i = 0; i < n; i++) {
    const o = i << 2;
    const Lu = clamp(L[i]! + amount * (L[i]! - Lblur[i]!), 0, 255);
    const ratio = clamp(Lu / Math.max(L[i]!, eps), rLo, rHi);
    data[o] = clamp(Math.round(data[o]! * ratio), 0, 255);
    data[o + 1] = clamp(Math.round(data[o + 1]! * ratio), 0, 255);
    data[o + 2] = clamp(Math.round(data[o + 2]! * ratio), 0, 255);
  }
}

function strengthParams(strength: RestoreImageStrength): {
  percentile: number;
  denoiseMix: number;
  unsharpPasses: readonly number[];
  amount: number;
  ratioClamp: [number, number];
  gammaLift: number;
} {
  switch (strength) {
    case "subtle":
      return {
        percentile: 0.04,
        denoiseMix: 0.1,
        unsharpPasses: [1, 1],
        amount: 0.62,
        ratioClamp: [0.92, 1.14],
        gammaLift: 0.93,
      };
    case "strong":
      return {
        percentile: 0.008,
        denoiseMix: 0.04,
        unsharpPasses: [2, 2],
        amount: 1,
        ratioClamp: [0.78, 1.38],
        gammaLift: 0.96,
      };
    default:
      return {
        percentile: 0.018,
        denoiseMix: 0.07,
        unsharpPasses: [1, 2],
        amount: 0.82,
        ratioClamp: [0.84, 1.26],
        gammaLift: 0.945,
      };
  }
}

function drawToHighQuality(dst: CanvasRenderingContext2D, srcCanvas: HTMLCanvasElement): void {
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = "high";
  dst.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, dst.canvas.width, dst.canvas.height);
}

function upscaleIterative(
  src: HTMLCanvasElement,
  outputW: number,
  outputH: number,
  strength: RestoreImageStrength,
): HTMLCanvasElement {
  let cw = src.width;
  let ch = src.height;
  let current: HTMLCanvasElement = src;

  for (let guard = 0; guard < 56; guard++) {
    const needW = outputW / Math.max(cw, 1);
    const needH = outputH / Math.max(ch, 1);
    const minRemain = Math.min(needW, needH);

    if (minRemain <= 1.0005 && cw >= outputW && ch >= outputH) break;
    if (minRemain <= 1.0005) break;

    const factor = Math.min(1.35, minRemain);
    const nw = Math.min(
      outputW,
      Math.max(cw + 1, Math.round(cw * factor)),
    );
    const nh = Math.min(
      outputH,
      Math.max(ch + 1, Math.round(ch * factor)),
    );
    const nc = document.createElement("canvas");
    nc.width = nw;
    nc.height = nh;
    drawToHighQuality(nc.getContext("2d")!, current);
    current = nc;
    cw = nw;
    ch = nh;
  }

  const final = document.createElement("canvas");
  final.width = outputW;
  final.height = outputH;
  const fctx = final.getContext("2d")!;
  drawToHighQuality(fctx, current);

  const grew = outputW > src.width || outputH > src.height;
  if (grew) {
    const pdata = fctx.getImageData(0, 0, outputW, outputH);
    const amtOut =
      strength === "strong" ? 0.38 : strength === "normal" ? 0.3 : 0.2;
    unsharpLuminanceRgb(
      pdata.data,
      outputW,
      outputH,
      [1, 1],
      amtOut,
      strength === "strong"
        ? [0.9, 1.12]
        : strength === "normal"
          ? [0.92, 1.1]
          : [0.94, 1.08],
    );
    fctx.putImageData(pdata, 0, 0);
  }

  return final;
}

export async function restoreAndEnhanceImage(
  srcUrl: string,
  options: RestoreImageQualityOptions,
): Promise<string> {
  const { upscaleFactor, strength } = options;
  const p = strengthParams(strength);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w0 = img.naturalWidth;
      const h0 = img.naturalHeight;
      if (!w0 || !h0) {
        reject(new Error("Imagem inválida."));
        return;
      }
      if (w0 * h0 > MAX_INPUT_PIXELS) {
        reject(
          new Error(
            "Esta imagem é demasiado grande para processar aqui — reduza a resolução ou use um serviço no servidor.",
          ),
        );
        return;
      }

      const work = document.createElement("canvas");
      work.width = w0;
      work.height = h0;
      const wctx = work.getContext("2d")!;
      wctx.drawImage(img, 0, 0);
      const imgData = wctx.getImageData(0, 0, w0, h0);
      const d = imgData.data;

      const [loY, hiY] = luminanceHistogramPercentiles(d, p.percentile);
      stretchLuminanceKeepChroma(d, loY, hiY);
      liftMidtonesGamma(d, p.gammaLift);
      softenNoiseRgb(d, w0, h0, p.denoiseMix);
      unsharpLuminanceRgb(d, w0, h0, p.unsharpPasses, p.amount, p.ratioClamp);
      wctx.putImageData(imgData, 0, 0);

      let outW = Math.round(w0 * upscaleFactor);
      let outH = Math.round(h0 * upscaleFactor);
      const maxSide = Math.max(outW, outH);
      if (maxSide > MAX_OUTPUT_SIDE) {
        const s = MAX_OUTPUT_SIDE / maxSide;
        outW = Math.round(outW * s);
        outH = Math.round(outH * s);
      }

      const needsUpscale = upscaleFactor > 1.005 || outW !== w0 || outH !== h0;
      const outCanvas = needsUpscale
        ? upscaleIterative(work, outW, outH, strength)
        : work;

      outCanvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Não foi possível gerar o PNG."));
        },
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    img.src = srcUrl;
  });
}
