import type { CSSProperties } from "react";
import type { ApparelProductType } from "./apparel-catalog";

/* ─── Luminância ──────────────────────────────────────────── */
function luminanceFromHex(hex: string): number {
  const s = hex.replace("#", "").trim();
  if (s.length !== 6) return 0.5;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/** Contorno da área de impressão sobre o tecido (contraste com a cor base). */
export function garmentStrokeRgba(fillHex: string): string {
  return luminanceFromHex(fillHex) < 0.32
    ? "rgba(255,255,255,0.22)"
    : "rgba(15,23,42,0.14)";
}

/* ─── Tipos ───────────────────────────────────────────────── */
export type GarmentPaths = {
  /** Silhueta exterior principal. */
  body: string;
  /** Gola interior (banda do decote — t-shirt). */
  collarBand?: string;
  /** Peça da gola polo (dobra visível). */
  collar?: string;
  /** Abertura/placket do polo (botões). */
  placket?: string;
  /** Posições dos botões do polo no espaço 200×200 [cx, cy]. */
  buttons?: ReadonlyArray<[number, number]>;
  /** Costura do ombro esquerdo. */
  seamShoulderL?: string;
  /** Costura do ombro direito. */
  seamShoulderR?: string;
  /** Bainha da manga esquerda. */
  seamCuffL?: string;
  /** Bainha da manga direita. */
  seamCuffR?: string;
};

/**
 * Silhuetas SVG vectoriais (viewBox 0 0 200 200) redesenhadas com
 * proporções anatómicas realistas para flat-lay.
 *
 * T-shirt : gola redonda funda, ombros curvos, mangas com costuras.
 * Polo    : gola polo dobrada com placket e 3 botões.
 * Colete  : abertura de braço profunda em arco duplo, decote arredondado.
 */
export const GARMENT_SVG_PATHS: Record<ApparelProductType, GarmentPaths> = {
  /**
   * T-shirt flat-lay — viewBox 200×200.
   * Corpo: x 62–138 (76 px).  Mangas: x 16–184.
   * Decote: y 44 (lados) → y 28 (cume — arco fundo de 16 px).
   */
  T_SHIRT: {
    body: [
      "M 80,46",
      "C 87,28 113,28 120,46",   // arco do decote (16 px fundo)
      "L 140,38",                 // ombro direito
      "C 158,36 180,52 184,72",  // manga direita exterior
      "L 165,82",                 // bainha manga direita
      "C 157,70 147,64 137,64",  // cava direita
      "L 137,186",                // corpo direito
      "L 63,186",                 // bainha inferior
      "L 63,64",                  // corpo esquerdo
      "C 53,64 43,70 35,82",     // cava esquerda
      "L 16,72",                  // bainha manga esquerda
      "C 20,52 42,36 60,38",     // manga esquerda exterior
      "Z",
    ].join(" "),

    /* Banda interior do decote (espessura ~12 px) */
    collarBand: [
      "M 83,49",
      "C 89,32 111,32 117,49",
      "C 113,63 87,63 83,49",
      "Z",
    ].join(" "),

    /* Costuras de ombro */
    seamShoulderL: "M 80,46 L 63,38",
    seamShoulderR: "M 120,46 L 137,38",

    /* Bainhas de manga */
    seamCuffL: "M 16,72 L 35,82",
    seamCuffR: "M 165,82 L 184,72",
  },

  /** Mesma silhueta T-shirt (grade idêntica). */
  PERSONALIZADO: {
    body: [
      "M 80,46",
      "C 87,28 113,28 120,46",
      "L 140,38",
      "C 158,36 180,52 184,72",
      "L 165,82",
      "C 157,70 147,64 137,64",
      "L 137,186",
      "L 63,186",
      "L 63,64",
      "C 53,64 43,70 35,82",
      "L 16,72",
      "C 20,52 42,36 60,38",
      "Z",
    ].join(" "),
    collarBand: [
      "M 83,49",
      "C 89,32 111,32 117,49",
      "C 113,63 87,63 83,49",
      "Z",
    ].join(" "),
    seamShoulderL: "M 80,46 L 63,38",
    seamShoulderR: "M 120,46 L 137,38",
    seamCuffL: "M 16,72 L 35,82",
    seamCuffR: "M 165,82 L 184,72",
  },

  /** Mesma silhueta T-shirt (grade idêntica). */
  EQUIPAMENTOS: {
    body: [
      "M 80,46",
      "C 87,28 113,28 120,46",
      "L 140,38",
      "C 158,36 180,52 184,72",
      "L 165,82",
      "C 157,70 147,64 137,64",
      "L 137,186",
      "L 63,186",
      "L 63,64",
      "C 53,64 43,70 35,82",
      "L 16,72",
      "C 20,52 42,36 60,38",
      "Z",
    ].join(" "),
    collarBand: [
      "M 83,49",
      "C 89,32 111,32 117,49",
      "C 113,63 87,63 83,49",
      "Z",
    ].join(" "),
    seamShoulderL: "M 80,46 L 63,38",
    seamShoulderR: "M 120,46 L 137,38",
    seamCuffL: "M 16,72 L 35,82",
    seamCuffR: "M 165,82 L 184,72",
  },

  /**
   * Polo flat-lay — viewBox 200×200.
   * Corpo: x 63–137. Mangas ligeiramente mais compridas que a t-shirt.
   * Gola polo: trapézio dobrado (y 24–56). Placket com 3 botões.
   */
  POLO: {
    body: [
      "M 82,56",
      "C 89,48 111,48 118,56",   // abertura sob a gola
      "L 138,50",                 // ombro direito
      "C 156,48 178,62 182,82",  // manga direita exterior
      "L 163,92",                 // bainha manga direita
      "C 155,80 145,74 136,74",  // cava direita
      "L 136,186",                // corpo direito
      "L 64,186",                 // bainha inferior
      "L 64,74",                  // corpo esquerdo
      "C 55,74 45,80 37,92",     // cava esquerda
      "L 18,82",                  // bainha manga esquerda
      "C 22,62 44,48 62,50",     // manga esquerda exterior
      "Z",
    ].join(" "),

    /* Gola polo dobrada (camada de cima) */
    collar: [
      "M 84,36",
      "C 87,22 113,22 116,36",   // topo da gola
      "L 116,56",
      "C 112,65 88,65 84,56",    // base dobrada
      "Z",
    ].join(" "),

    /* Placket de botões (abertura central) */
    placket: [
      "M 96,56",
      "L 104,56",
      "L 104,96",
      "C 104,100 96,100 96,96",
      "Z",
    ].join(" "),

    /* 3 botões [cx, cy] no espaço 200×200 */
    buttons: [
      [100, 64],
      [100, 76],
      [100, 88],
    ],

    seamShoulderL: "M 82,56 L 64,50",
    seamShoulderR: "M 118,56 L 136,50",
    seamCuffL: "M 18,82 L 37,92",
    seamCuffR: "M 163,92 L 182,82",
  },

  /**
   * Colete flat-lay — viewBox 200×200.
   * Sem mangas. Abertura de braço em arco duplo profundo (cava pronunciada).
   * Decote arredondado. Corpo: x 66–134.
   */
  COLETE: {
    body: [
      "M 83,44",
      "C 89,28 111,28 117,44",   // decote arredondado
      "L 136,38",                 // ombro direito
      "C 148,38 154,56 152,76",  // arco superior cava direita
      "C 149,98 143,118 136,132", // arco inferior cava direita (profundo)
      "L 136,186",                // corpo direito
      "L 64,186",                 // bainha inferior
      "L 64,132",                 // corpo esquerdo
      "C 57,118 51,98 48,76",    // arco inferior cava esquerda
      "C 46,56 52,38 64,38",     // arco superior cava esquerda
      "Z",
    ].join(" "),

    /* Banda interior do decote */
    collarBand: [
      "M 86,47",
      "C 91,32 109,32 114,47",
      "C 110,60 90,60 86,47",
      "Z",
    ].join(" "),

    seamShoulderL: "M 83,44 L 64,38",
    seamShoulderR: "M 117,44 L 136,38",
  },

  /** Boné — vista de cima simplificada (elipse + copo). */
  BONE: {
    body: [
      "M 100,36",
      "C 132,36 156,58 156,88",
      "C 156,118 132,142 100,142",
      "C 68,142 44,118 44,88",
      "C 44,58 68,36 100,36",
      "Z",
    ].join(" "),
  },
};

/** Silhueta SVG com fallback seguro (tipos novos → T-shirt). */
export function garmentSvgPaths(productType: ApparelProductType): GarmentPaths {
  return GARMENT_SVG_PATHS[productType] ?? GARMENT_SVG_PATHS.T_SHIRT;
}
/**
 * Retângulo da área de impressão recomendada (espaço 200×200).
 * Serve de guia visual para o cliente posicionar a arte.
 */
export const GARMENT_PRINT_AREAS: Record<
  ApparelProductType,
  { front: { x: number; y: number; w: number; h: number };
    back:  { x: number; y: number; w: number; h: number } }
> = {
  T_SHIRT: {
    front: { x: 73, y: 70, w: 54, h: 80 },
    back:  { x: 69, y: 66, w: 62, h: 90 },
  },
  PERSONALIZADO: {
    front: { x: 73, y: 70, w: 54, h: 80 },
    back:  { x: 69, y: 66, w: 62, h: 90 },
  },
  EQUIPAMENTOS: {
    front: { x: 73, y: 70, w: 54, h: 80 },
    back:  { x: 69, y: 66, w: 62, h: 90 },
  },
  POLO: {
    front: { x: 76, y: 84, w: 48, h: 68 },
    back:  { x: 70, y: 68, w: 60, h: 86 },
  },
  COLETE: {
    front: { x: 78, y: 56, w: 44, h: 72 },
    back:  { x: 74, y: 52, w: 52, h: 84 },
  },
  BONE: {
    front: { x: 72, y: 72, w: 56, h: 48 },
    back:  { x: 76, y: 76, w: 48, h: 40 },
  },
};

/* ─── Tinting fotorrealista (canvas export) ───────────────── */
export function tintModelImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  img: HTMLImageElement,
  fillHex: string,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = fillHex;
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.globalCompositeOperation = "luminosity";
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalCompositeOperation = "source-over";
}

/* ─── Renderização SVG no canvas 2D ──────────────────────── */
/**
 * Preenche a peça no canvas de saída (512×512 para export).
 * Quando há imagem modelo usa tinting fotorrealista.
 * Sem imagem usa o SVG melhorado com detalhes de gola, costuras e sombreado.
 */
export function drawGarmentOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  productType: ApparelProductType,
  fillHex: string,
  modelImage?: HTMLImageElement | null,
) {
  if (modelImage?.complete && (modelImage.naturalWidth || modelImage.width)) {
    tintModelImageOnCanvas(ctx, w, h, modelImage, fillHex);
    return;
  }

  const sc = w / 200; // escala viewBox → canvas
  const paths = garmentSvgPaths(productType);
  const lum = luminanceFromHex(fillHex);
  const stroke = garmentStrokeRgba(fillHex);

  ctx.save();
  ctx.scale(sc, sc);

  /* ── 1. Corpo principal ── */
  const bodyPath = new Path2D(paths.body);
  ctx.fillStyle = fillHex;
  ctx.fill(bodyPath);

  /* ── 2. Sombreado de volume (clipe ao corpo) — muito subtil ── */
  ctx.save();
  ctx.clip(bodyPath);

  // Luz vinda de cima → highlight suave (max 12% branco)
  const light = ctx.createLinearGradient(100, 28, 100, 188);
  light.addColorStop(0,    "rgba(255,255,255,0.12)");
  light.addColorStop(0.40, "rgba(255,255,255,0.00)");
  light.addColorStop(1,    "rgba(0,0,0,0.10)");
  ctx.fillStyle = light;
  ctx.fillRect(-5, -5, 210, 210);

  // Vinheta de borda (máx 10% preto — não escurece muito)
  const edge = ctx.createRadialGradient(100, 108, 50, 100, 108, 108);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = edge;
  ctx.fillRect(-5, -5, 210, 210);

  ctx.restore();

  /* ── 3. Contorno do corpo ── */
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.stroke(bodyPath);

  /* ── 4. Banda interior do decote ── */
  if (paths.collarBand) {
    const cbPath = new Path2D(paths.collarBand);
    // Cor ligeiramente mais escura/mais clara para simular profundidade
    const bandAlpha = lum < 0.32 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
    ctx.fillStyle = fillHex;
    ctx.fill(cbPath);
    ctx.fillStyle = bandAlpha;
    ctx.fill(cbPath);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke(cbPath);
  }

  /* ── 5. Gola polo ── */
  if (paths.collar) {
    const cp = new Path2D(paths.collar);

    // Preenchimento base
    ctx.fillStyle = fillHex;
    ctx.fill(cp);

    // Sombreado da dobra: topo mais claro, base mais escuro
    ctx.save();
    ctx.clip(cp);
    const foldGrad = ctx.createLinearGradient(100, 22, 100, 65);
    foldGrad.addColorStop(0, lum < 0.32 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.30)");
    foldGrad.addColorStop(0.5, "rgba(0,0,0,0)");
    foldGrad.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = foldGrad;
    ctx.fillRect(80, 20, 40, 50);
    ctx.restore();

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke(cp);

    // Linha de dobra da gola (prega horizontal)
    ctx.save();
    ctx.strokeStyle = lum < 0.32 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(85, 46);
    ctx.bezierCurveTo(90, 44, 110, 44, 115, 46);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ── 6. Placket do polo ── */
  if (paths.placket) {
    const pp = new Path2D(paths.placket);
    ctx.fillStyle = lum < 0.32 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    ctx.fill(pp);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke(pp);
  }

  /* ── 7. Botões do polo ── */
  if (paths.buttons) {
    const btnColor = lum < 0.32 ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.30)";
    const btnStroke = lum < 0.32 ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.12)";
    for (const [bx, by] of paths.buttons) {
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = btnColor;
      ctx.fill();
      ctx.strokeStyle = btnStroke;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  /* ── 8. Costuras (linhas tracejadas subtis) ── */
  const seamStyle = lum < 0.32 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  ctx.strokeStyle = seamStyle;
  ctx.lineWidth = 0.7;
  ctx.setLineDash([3, 2.5]);
  ctx.lineCap = "round";

  for (const seamKey of ["seamShoulderL", "seamShoulderR", "seamCuffL", "seamCuffR"] as const) {
    const d = paths[seamKey];
    if (d) {
      ctx.beginPath();
      const p = new Path2D(d);
      ctx.stroke(p);
    }
  }
  ctx.setLineDash([]);

  ctx.restore();
}

/* ─── Backdrop boxes (UI HTML overlay) ───────────────────── */
export type GarmentBackdropBox = {
  style: CSSProperties;
  collarStyle?: CSSProperties;
};

export function garmentBackdropBoxes(
  productType: ApparelProductType,
  fillHex: string,
): GarmentBackdropBox {
  const stroke = garmentStrokeRgba(fillHex);
  const inset = `inset 0 0 0 2px ${stroke}`;

  if (productType === "COLETE") {
    return {
      style: {
        position: "absolute",
        top: "5%",
        bottom: "5%",
        left: "16%",
        right: "16%",
        borderRadius: "14px",
        backgroundColor: fillHex,
        boxShadow: inset,
      },
    };
  }

  if (productType === "POLO") {
    return {
      style: {
        position: "absolute",
        top: "14%",
        bottom: "5%",
        left: "8%",
        right: "8%",
        borderRadius: "14px",
        backgroundColor: fillHex,
        boxShadow: inset,
      },
      collarStyle: {
        position: "absolute",
        top: "5%",
        left: "50%",
        width: "22%",
        height: "10%",
        transform: "translateX(-50%)",
        borderRadius: "6px 6px 10px 10px",
        backgroundColor: fillHex,
        boxShadow: inset,
      },
    };
  }

  if (productType === "BONE") {
    return {
      style: {
        position: "absolute",
        top: "18%",
        bottom: "18%",
        left: "22%",
        right: "22%",
        borderRadius: "50%",
        backgroundColor: fillHex,
        boxShadow: inset,
      },
    };
  }

  // T-shirt
  return {
    style: {
      position: "absolute",
      top: "7%",
      bottom: "5%",
      left: "7%",
      right: "7%",
      borderRadius: "16px",
      backgroundColor: fillHex,
      boxShadow: inset,
    },
  };
}
