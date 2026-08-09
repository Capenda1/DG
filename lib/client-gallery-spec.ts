/** Recomendações de imagem para o slideshow em `/conta`. */
export const CLIENT_GALLERY_SPEC = {
  /** Proporção ideal — alinha-se ao palco do slideshow. */
  idealRatio: 16 / 9,
  idealLabel: "16:9",
  idealSize: "1920 × 1080 px",
  /** Também funcionam bem no palco (object-contain). */
  altLabels: ["4:3", "3:2"] as const,
  minWidth: 1200,
  maxFileMb: 10,
  formats: "PNG, JPEG ou WEBP",
} as const;

export type GalleryFitLevel = "ideal" | "good" | "portrait" | "wide";

export type GalleryFitEvaluation = {
  level: GalleryFitLevel;
  label: string;
  detail: string;
  ratio: number;
};

export function galleryAspectRatio(width: number, height: number): number {
  if (height <= 0) return 1;
  return width / height;
}

export function evaluateGalleryImageFit(
  width: number,
  height: number,
): GalleryFitEvaluation {
  const ratio = galleryAspectRatio(width, height);

  if (height > width * 1.05) {
    return {
      level: "portrait",
      label: "Vertical",
      detail:
        "Funciona, mas ficará com margens laterais no slideshow. Preferível horizontal 16:9.",
      ratio,
    };
  }

  if (ratio >= 2.35) {
    return {
      level: "wide",
      label: "Panorâmica",
      detail: "Muito larga — pode parecer pequena no palco. Recorta para 16:9 se possível.",
      ratio,
    };
  }

  const ideal = CLIENT_GALLERY_SPEC.idealRatio;
  const idealDelta = Math.abs(ratio - ideal) / ideal;

  if (idealDelta <= 0.08) {
    return {
      level: "ideal",
      label: "Proporção ideal",
      detail: `${CLIENT_GALLERY_SPEC.idealLabel} — encaixa perfeitamente no palco da área cliente.`,
      ratio,
    };
  }

  if (ratio >= 1.25 && ratio <= 2.1) {
    return {
      level: "good",
      label: "Boa proporção",
      detail: "A imagem adapta-se bem. Para o melhor resultado, usa 16:9 (1920×1080).",
      ratio,
    };
  }

  return {
    level: "good",
    label: "Utilizável",
    detail: "Considera exportar em 16:9 para preencher melhor o slideshow.",
    ratio,
  };
}

export function formatGalleryRatio(ratio: number): string {
  if (ratio >= 1.9) return "16:9";
  if (ratio >= 1.45) return "3:2";
  if (ratio >= 1.2) return "4:3";
  if (ratio < 0.85) return "9:16";
  return `${ratio.toFixed(2)}:1`;
}

/** Lê largura/altura de um ficheiro ou URL de imagem no browser. */
export function readImageDimensions(
  source: File | string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const revoke = () => {
      if (source instanceof File && img.src.startsWith("blob:")) {
        URL.revokeObjectURL(img.src);
      }
    };

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      revoke();
    };
    img.onerror = () => {
      revoke();
      reject(new Error("Não foi possível ler as dimensões da imagem."));
    };

    img.src = source instanceof File ? URL.createObjectURL(source) : source;
  });
}
