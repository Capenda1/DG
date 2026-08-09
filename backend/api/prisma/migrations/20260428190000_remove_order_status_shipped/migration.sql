-- Pedidos são entregues localmente; elimina o estado intermédio SHIPPED.

UPDATE "orders" SET "status" = 'DELIVERED' WHERE "status" = 'SHIPPED';

CREATE TYPE "OrderStatus_new" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'AWAITING_DESIGNER',
  'CLIENT_EDITING',
  'AWAITING_CLIENT',
  'ADJUSTMENTS_REQUESTED',
  'APPROVED_FOR_PRODUCTION',
  'IN_QUEUE',
  'PRINTING',
  'FINISHING',
  'DELIVERED',
  'CANCELLED',
  'BLOCKED'
);

ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "orders"
  ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING ("status"::text::"OrderStatus_new");

ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"OrderStatus_new";

DROP TYPE "OrderStatus";

ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
