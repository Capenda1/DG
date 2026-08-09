-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('online', 'balcao');

-- AlterEnum PaymentMethod (novos valores — não são referenciados nesta transacção)
ALTER TYPE "PaymentMethod" ADD VALUE 'PDV_CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'PDV_DEBIT_CARD';
ALTER TYPE "PaymentMethod" ADD VALUE 'PDV_CREDIT_CARD';

-- UserRole: Postgres não permite ADD VALUE e já usar o valor na mesma transacção.
-- Recriamos o enum e mapeamos PRODUCTION -> ATTENDANT num único USING.
CREATE TYPE "UserRole_new" AS ENUM ('CLIENT', 'DESIGNER', 'ATTENDANT', 'ADMIN');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE
    WHEN "role"::text = 'PRODUCTION' THEN 'ATTENDANT'::"UserRole_new"
    ELSE "role"::text::"UserRole_new"
  END
);

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "order_origin" "OrderOrigin" NOT NULL DEFAULT 'online';
ALTER TABLE "orders" ADD COLUMN "attendant_id" UUID;

ALTER TABLE "orders" ADD CONSTRAINT "orders_attendant_id_fkey" FOREIGN KEY ("attendant_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_attendant_id_idx" ON "orders"("attendant_id");
