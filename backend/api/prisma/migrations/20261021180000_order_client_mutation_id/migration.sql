ALTER TABLE "orders" ADD COLUMN "client_mutation_id" UUID;

CREATE UNIQUE INDEX "orders_client_mutation_id_key" ON "orders"("client_mutation_id");
