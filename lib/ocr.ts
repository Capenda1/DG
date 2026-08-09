/**
 * OCR utility usando Tesseract.js v7 (corre inteiramente no browser — custo zero).
 *
 * Problema chave (Tesseract.js v7):
 *   O método shortcut `Tesseract.recognize()` apenas retorna { text: true } por omissão.
 *   Os `blocks` (linhas com coordenadas) ficam null.
 *   Solução: usar `createWorker` com output explícito `{ blocks: true }`.
 *
 * Fontes suportadas:
 *   - Blob / File  — upload directo
 *   - string       — data URL (base64) ou URL https do preview de um template
 */

export interface OcrLine {
  text: string;
  /** Centro horizontal 0–1 */
  xRel: number;
  /** Centro vertical 0–1 */
  yRel: number;
  /** Largura 0–1 */
  widthRel: number;
  /** Altura 0–1 (usada para estimar fontSize) */
  heightRel: number;
  /** Confiança 0–100 */
  confidence: number;
}

export interface OcrProgress {
  status: string;
  /** 0–100 */
  progress: number;
}

/** Converte qualquer fonte suportada para Blob */
async function toBlob(source: string | Blob | File): Promise<Blob> {
  if (source instanceof Blob) return source;
  /* URL string — faz fetch e converte */
  const resp = await fetch(source);
  if (!resp.ok) throw new Error(`Não foi possível carregar a imagem (${resp.status})`);
  return resp.blob();
}

/** Mede as dimensões reais de um Blob de imagem */
function measureBlob(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 0, h: 0 }); };
    img.src = url;
  });
}

/**
 * Extrai texto de uma imagem com posições normalizadas.
 *
 * @param source      Blob, File, data URL (base64) ou URL https
 * @param onProgress  callback de progresso (0–100)
 */
export async function extractTextFromImage(
  source: string | Blob | File,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrLine[]> {
  /* Importação dinâmica — WASM e worker só carregam quando necessário */
  const { createWorker } = await import("tesseract.js");

  const blob = await toBlob(source);
  const { w: imgW, h: imgH } = await measureBlob(blob);
  if (!imgW || !imgH) return [];

  const worker = await createWorker("eng+por", 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({
        status: m.status ?? "A processar…",
        progress: Math.round((m.progress ?? 0) * 100),
      });
    },
  });

  try {
    /* Pedir explicitamente blocks — sem isto ficam null */
    const result = await worker.recognize(blob, {}, { blocks: true });

    const blocks = result.data.blocks;

    /* Fallback: sem blocos mas com texto → uma linha centrada */
    if (!blocks?.length) {
      const fallback = result.data.text?.trim();
      if (!fallback) return [];
      return [{
        text: fallback,
        xRel: 0.5, yRel: 0.5,
        widthRel: 0.8, heightRel: 0.05,
        confidence: result.data.confidence ?? 50,
      }];
    }

    const lines: OcrLine[] = [];
    for (const block of blocks) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.trim().replace(/\n/g, " ");
          if (!text || line.confidence < 20) continue;
          const { x0, y0, x1, y1 } = line.bbox;
          lines.push({
            text,
            xRel: (x0 + x1) / 2 / imgW,
            yRel: (y0 + y1) / 2 / imgH,
            widthRel: (x1 - x0) / imgW,
            heightRel: Math.max((y1 - y0) / imgH, 0.01),
            confidence: Math.round(line.confidence),
          });
        }
      }
    }

    return lines.sort((a, b) => a.yRel - b.yRel);

  } finally {
    await worker.terminate();
  }
}
