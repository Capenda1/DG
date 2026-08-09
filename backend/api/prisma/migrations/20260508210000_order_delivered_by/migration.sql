-- Quem entregou e quando (última fase do pedido)
ALTER TABLE "orders" ADD COLUMN "delivered_by_id" UUID;
ALTER TABLE "orders" ADD COLUMN "delivered_at" TIMESTAMP(3);

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_delivered_by_id_idx" ON "orders"("delivered_by_id");
