/**
 * Geração em massa de variantes para canecas e impressão plana.
 */
import {
  bulkCreateAdminProductVariants,
  type CreateAdminProductVariantBody,
} from "@/lib/api-client";
import {
  nonApparelVariantMatrixForCode,
  type NonApparelVariantRow,
} from "@/lib/non-apparel-catalog";

const BATCH_CHUNK_SIZE = 80;

export async function bulkCreateNonApparelVariantsForProduct(
  productId: string,
  productCode: string,
  opts: {
    existingSkus: Set<string>;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const matrix = nonApparelVariantMatrixForCode(productCode);
  if (!matrix?.length) {
    return {
      created: 0,
      skipped: 0,
      errors: [`O código «${productCode}» não tem matriz automática.`],
    };
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const total = matrix.length;
  const toCreate: CreateAdminProductVariantBody[] = [];

  let done = 0;
  for (const row of matrix) {
    done++;
    if (opts.existingSkus.has(row.sku)) {
      skipped++;
      opts.onProgress?.(done, total);
      continue;
    }
    toCreate.push(rowToVariantBody(row));
    opts.onProgress?.(done, total);
  }

  for (let i = 0; i < toCreate.length; i += BATCH_CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const res = await bulkCreateAdminProductVariants(productId, chunk);
      created += res.created ?? chunk.length;
      if (res.errors?.length) errors.push(...res.errors);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Erro ao criar variantes.");
    }
  }

  return { created, skipped, errors };
}

function rowToVariantBody(row: NonApparelVariantRow): CreateAdminProductVariantBody {
  return {
    sku: row.sku,
    size: row.size,
    baseColor: row.baseColor,
    productionProcess: "SUBLIMATION",
    garmentType: null,
    unitPrice: row.unitPrice,
    currency: "AOA",
    active: true,
    metadata: row.metadata ?? {},
  };
}
