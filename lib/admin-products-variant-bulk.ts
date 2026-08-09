/**
 * Geração em massa de variantes de catálogo — usa POST batch no servidor em chunks.
 */
import { bulkCreateAdminProductVariants, type CreateAdminProductVariantBody } from "@/lib/api-client";
import {
  buildApparelCatalogVariantMatrix,
  buildAdminVariantSku,
  type ApparelProductType,
} from "@/lib/apparel-catalog";
import {
  resolveColorUnitPrice,
  type ParsedColorPrices,
} from "@/lib/product-color-prices";

const BATCH_CHUNK_SIZE = 80;

export async function bulkCreateVariantsForProduct(
  productId: string,
  productCode: string,
  garmentType: ApparelProductType,
  opts: {
    includeChildSizes: boolean;
    colorPrices: ParsedColorPrices;
    existingSkus: Set<string>;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const matrix = buildApparelCatalogVariantMatrix(garmentType, {
    includeChildSizes: opts.includeChildSizes,
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const total = matrix.length;
  const toCreate: CreateAdminProductVariantBody[] = [];

  let done = 0;
  for (const row of matrix) {
    done++;
    const sku = buildAdminVariantSku(productCode, row);
    if (opts.existingSkus.has(sku)) {
      skipped++;
      opts.onProgress?.(done, total);
      continue;
    }
    const unitPrice = resolveColorUnitPrice(
      opts.colorPrices,
      garmentType,
      row.colorId,
      row.ageBand,
      row.brandId,
      row.productionProcess,
    );
    if (unitPrice === null) {
      errors.push(
        `${sku}: sem preço ${
          row.ageBand === "CHILD" ? "infantil" : "adulto"
        } para «${row.colorId}».`,
      );
      opts.onProgress?.(done, total);
      continue;
    }
    toCreate.push({
      sku,
      size: row.size,
      baseColor: row.colorId,
      productionProcess: row.productionProcess,
      garmentType,
      unitPrice,
      currency: "AOA",
      active: true,
      metadata: { brandId: row.brandId, ageBand: row.ageBand },
    });
    opts.onProgress?.(done, total);
  }

  for (let i = 0; i < toCreate.length; i += BATCH_CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + BATCH_CHUNK_SIZE);
    const res = await bulkCreateAdminProductVariants(productId, chunk);
    created += res.created;
    errors.push(...res.errors);
    for (const body of chunk) opts.existingSkus.add(body.sku);
  }

  opts.onProgress?.(total, total);

  return { created, skipped, errors };
}
