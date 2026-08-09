-- Famílias de catálogo editáveis (Fase 2 — modelos extensíveis)
CREATE TYPE "CatalogFamily" AS ENUM (
  'VESTUARIO',
  'CANECA',
  'IMPRESSAO_PLANA',
  'SERVICO',
  'GENERICO'
);

ALTER TABLE "products"
  ADD COLUMN "catalog_family" "CatalogFamily" NOT NULL DEFAULT 'GENERICO',
  ADD COLUMN "family_config" JSONB;

UPDATE "products"
SET
  "catalog_family" = 'VESTUARIO',
  "family_config" = CASE "code"
    WHEN 'TSHIRT-CLASSIC' THEN '{"garmentType":"T_SHIRT"}'::jsonb
    WHEN 'POLO-LACOST' THEN '{"garmentType":"POLO"}'::jsonb
    WHEN 'COLETE' THEN '{"garmentType":"COLETE"}'::jsonb
    WHEN 'BONE-REDE' THEN '{"garmentType":"BONE"}'::jsonb
    ELSE "family_config"
  END
WHERE "code" IN ('TSHIRT-CLASSIC', 'POLO-LACOST', 'COLETE', 'BONE-REDE');

CREATE INDEX "products_catalog_family_idx" ON "products" ("catalog_family");
