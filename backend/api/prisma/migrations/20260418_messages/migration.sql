CREATE TABLE "messages" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "order_id"   UUID        NOT NULL,
  "sender_id"  UUID        NOT NULL,
  "content"    TEXT        NOT NULL,
  "read_at"    TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_order_id_fkey"  FOREIGN KEY ("order_id")  REFERENCES "orders"("id")  ON DELETE CASCADE,
  CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id")   ON DELETE RESTRICT
);
CREATE INDEX "messages_order_id_created_at_idx" ON "messages"("order_id","created_at");
