import type { ApparelProductType } from "./apparel-catalog";

/**
 * Mockups 2D (frente/costas ou planta) em `public/img/`.
 * Coloca os ficheiros com estes nomes ou altera os caminhos abaixo.
 */
export const MODELAGEM_MODEL_IMAGE: Record<ApparelProductType, string> = {
  T_SHIRT: "/img/modelo-tshirt.png",
  POLO: "/img/modelo-polo.png",
  COLETE: "/img/modelo-colete.png",
  BONE: "/img/modelo-tshirt.png",
  PERSONALIZADO: "/img/modelo-tshirt.png",
  EQUIPAMENTOS: "/img/modelo-tshirt.png",
};

export const MODELAGEM_MUG_IMAGE = "/img/modelo-caneca.png";

export function modelagemMugImageUrl(): string {
  return MODELAGEM_MUG_IMAGE;
}

export function modelagemModelImageUrl(productType: ApparelProductType): string {
  return MODELAGEM_MODEL_IMAGE[productType];
}
