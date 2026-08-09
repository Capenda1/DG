-- CreateTable
CREATE TABLE "order_client_files" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_client_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_client_files_order_id_idx" ON "order_client_files"("order_id");

-- AddForeignKey
ALTER TABLE "order_client_files" ADD CONSTRAINT "order_client_files_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_client_files" ADD CONSTRAINT "order_client_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
