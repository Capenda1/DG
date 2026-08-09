/** Campos relevantes para detectar alterações por guardar (ignora ids gerados no cliente). */
type FingerprintLayer =
  | {
      kind: "text";
      text: string;
      x: number;
      y: number;
      scale: number;
      rotationDeg: number;
      zIndex: number;
      fontSize: number;
      side?: string;
      fontFamily?: string;
      bold?: boolean;
      italic?: boolean;
      opacity?: number;
      strokeColor?: string;
      strokeWidth?: number;
      textEffect?: string;
      curveStyle?: string;
      curveRadius?: number;
      curveFlip?: boolean;
      designerModel?: boolean;
    }
  | {
      kind: "image";
      x: number;
      y: number;
      scale: number;
      rotationDeg: number;
      zIndex: number;
      widthRel: number;
      aspect: number;
      side?: string;
      opacity?: number;
      flipX?: boolean;
      orderModelagemFileId?: string;
      srcKey?: string;
      designerModel?: boolean;
    };

function layerToFingerprint(layer: {
  kind: string;
  [key: string]: unknown;
}): FingerprintLayer {
  if (layer.kind === "text") {
    const t = layer as FingerprintLayer & { kind: "text" };
    return {
      kind: "text",
      text: String(t.text ?? ""),
      x: Number(t.x),
      y: Number(t.y),
      scale: Number(t.scale),
      rotationDeg: Number(t.rotationDeg),
      zIndex: Number(t.zIndex),
      fontSize: Number(t.fontSize),
      side: t.side as string | undefined,
      fontFamily: t.fontFamily as string | undefined,
      bold: t.bold as boolean | undefined,
      italic: t.italic as boolean | undefined,
      opacity: t.opacity as number | undefined,
      strokeColor: t.strokeColor as string | undefined,
      strokeWidth: t.strokeWidth as number | undefined,
      textEffect: t.textEffect as string | undefined,
      curveStyle: (layer as { curveStyle?: string }).curveStyle,
      curveRadius: (layer as { curveRadius?: number }).curveRadius,
      curveFlip: (layer as { curveFlip?: boolean }).curveFlip,
      designerModel: t.designerModel as boolean | undefined,
    };
  }
  const im = layer as FingerprintLayer & { kind: "image" };
  const src = String((layer as { src?: string }).src ?? "");
  const srcKey =
    (im.orderModelagemFileId as string | undefined) ||
    (src.startsWith("data:") ? src.slice(0, 80) : src.startsWith("blob:") ? "blob" : src);
  return {
    kind: "image",
    x: Number(im.x),
    y: Number(im.y),
    scale: Number(im.scale),
    rotationDeg: Number(im.rotationDeg),
    zIndex: Number(im.zIndex),
    widthRel: Number(im.widthRel),
    aspect: Number(im.aspect),
    side: im.side as string | undefined,
    opacity: im.opacity as number | undefined,
    flipX: im.flipX as boolean | undefined,
    orderModelagemFileId: im.orderModelagemFileId as string | undefined,
    srcKey,
    designerModel: im.designerModel as boolean | undefined,
  };
}

/** Impressão digital estável para comparar composições. */
export function modelagemLayersFingerprint(layers: unknown[]): string {
  const normalized = layers
    .map((l) => layerToFingerprint(l as { kind: string }))
    .sort((a, b) => a.zIndex - b.zIndex || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalized);
}

export function modelagemLayersDirty(
  current: unknown[],
  savedFingerprint: string | null,
): boolean {
  if (!savedFingerprint) return current.length > 0;
  return modelagemLayersFingerprint(current) !== savedFingerprint;
}
