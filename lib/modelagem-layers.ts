/** Camadas da zona de impressão (coordenadas normalizadas 0–1, centro da camada). */

export const MODELAGEM_COMPOSITE_SIZE = 512;

export type DesignLayerBase = {
  id: string;
  zIndex: number;
  /** Centro horizontal (0 = esquerda, 1 = direita). */
  x: number;
  /** Centro vertical (0 = topo, 1 = fundo). */
  y: number;
  /** Escala uniforme (1 = tamanho base). */
  scale: number;
  /** Rotação em graus. */
  rotationDeg: number;
};

export type TextDesignLayer = DesignLayerBase & {
  kind: "text";
  text: string;
  color: string;
  /** Tamanho base em px no canvas 512 (antes de scale). */
  fontSize: number;
};

export type ImageDesignLayer = DesignLayerBase & {
  kind: "image";
  /** object URL ou data URL. */
  src: string;
  /** Largura relativa à arte (fração da largura do canvas, ex. 0.35). */
  widthRel: number;
  /** largura / altura da imagem original. */
  aspect: number;
};

export type DesignLayer = TextDesignLayer | ImageDesignLayer;

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function sortLayersByZ(layers: DesignLayer[]): DesignLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}

export function nextZIndex(layers: DesignLayer[]): number {
  if (layers.length === 0) return 0;
  return Math.max(...layers.map((l) => l.zIndex)) + 1;
}
