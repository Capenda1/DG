-- Corrige P2022 se a coluna faltar na BD a que a API está ligada (PostgreSQL 11+).
-- Uso: npx prisma db execute --file scripts/fix-missing-draft-shared-column.sql --schema prisma/schema.prisma
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "draft_shared_with_design_team" BOOLEAN NOT NULL DEFAULT false;
