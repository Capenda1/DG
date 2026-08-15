ALTER TABLE "orders"
  ADD COLUMN "cancellation_reason" VARCHAR(2000),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_id" UUID,
  ADD COLUMN "cancelled_from_status" "OrderStatus";

CREATE INDEX "orders_cancelled_by_id_idx" ON "orders"("cancelled_by_id");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
