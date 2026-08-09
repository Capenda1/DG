-- Novos campos de insumo e categoria como texto livre (listas editáveis na UI).
ALTER TABLE "insumos" ADD COLUMN "preco_venda" DECIMAL(12,2),
ADD COLUMN "fornecedor" VARCHAR(120),
ADD COLUMN "marca" VARCHAR(120);

ALTER TABLE "insumos" ALTER COLUMN "unidade" TYPE VARCHAR(32);

ALTER TABLE "insumos" ALTER COLUMN "categoria" DROP DEFAULT;
ALTER TABLE "insumos" ALTER COLUMN "categoria" TYPE VARCHAR(64) USING ("categoria"::text);
ALTER TABLE "insumos" ALTER COLUMN "categoria" SET DEFAULT 'OUTRO';

DROP TYPE IF EXISTS "InsumoCategoria";
