import { ProductionProcess } from '@prisma/client';

/**
 * Cores do catálogo Dádiva em que só DTF é permitido — espelha `apparel-catalog.ts` (frontend).
 */
const DTF_ONLY_BASE_COLORS = new Set(['preta', 'azul-escuro']);

/**
 * Processo efectivo para variantes antigas sem `productionProcess` na BD.
 */
export function effectiveVariantProductionProcess(
  baseColor: string | null | undefined,
  stored: ProductionProcess | null | undefined,
): ProductionProcess {
  if (
    stored === ProductionProcess.SUBLIMATION ||
    stored === ProductionProcess.DTF
  ) {
    return stored;
  }
  const c = baseColor?.trim().toLowerCase() ?? '';
  if (DTF_ONLY_BASE_COLORS.has(c)) return ProductionProcess.DTF;
  return ProductionProcess.SUBLIMATION;
}
