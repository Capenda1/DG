-- CreateEnum
CREATE TYPE "InsumoCategoria" AS ENUM ('TECIDO', 'TINTA', 'TRANSFER', 'VINIL', 'ETIQUETA', 'EMBALAGEM', 'BORDADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "MovimentoTipo" AS ENUM ('ENTRADA', 'SAIDA_MANUAL', 'SAIDA_PEDIDO');

-- CreateTable: insumos
CREATE TABLE "insumos" (
    "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
    "nome"          TEXT            NOT NULL,
    "categoria"     "InsumoCategoria" NOT NULL DEFAULT 'OUTRO',
    "unidade"       VARCHAR(16)     NOT NULL DEFAULT 'un',
    "custo_unit"    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "stock_actual"  DECIMAL(12,3)   NOT NULL DEFAULT 0,
    "stock_minimo"  DECIMAL(12,3)   NOT NULL DEFAULT 0,
    "notas"         TEXT,
    "activo"        BOOLEAN         NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insumos_activo_idx"    ON "insumos"("activo");
CREATE INDEX "insumos_categoria_idx" ON "insumos"("categoria");

-- CreateTable: movimentos_insumo
CREATE TABLE "movimentos_insumo" (
    "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
    "insumo_id"    UUID          NOT NULL,
    "tipo"         "MovimentoTipo" NOT NULL,
    "quantidade"   DECIMAL(12,3) NOT NULL,
    "custo_unit"   DECIMAL(12,2),
    "nota"         TEXT,
    "order_id"     UUID,
    "user_id"      UUID          NOT NULL,
    "created_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimentos_insumo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movimentos_insumo_insumo_id_created_at_idx" ON "movimentos_insumo"("insumo_id", "created_at");
CREATE INDEX "movimentos_insumo_order_id_idx"             ON "movimentos_insumo"("order_id");

-- CreateTable: insumos_consumo
CREATE TABLE "insumos_consumo" (
    "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
    "insumo_id"       UUID          NOT NULL,
    "tipo_produto"    TEXT,
    "processo"        VARCHAR(32),
    "qtd_por_unidade" DECIMAL(12,4) NOT NULL,
    CONSTRAINT "insumos_consumo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insumos_consumo_insumo_id_idx" ON "insumos_consumo"("insumo_id");

-- AddForeignKey
ALTER TABLE "movimentos_insumo" ADD CONSTRAINT "movimentos_insumo_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movimentos_insumo" ADD CONSTRAINT "movimentos_insumo_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movimentos_insumo" ADD CONSTRAINT "movimentos_insumo_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insumos_consumo" ADD CONSTRAINT "insumos_consumo_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
