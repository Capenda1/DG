-- Galeria de fotos na área do cliente (slideshow /conta)
CREATE TABLE "client_gallery_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_gallery_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_gallery_items_active_sort_order_idx" ON "client_gallery_items"("active", "sort_order");

ALTER TABLE "client_gallery_items" ADD CONSTRAINT "client_gallery_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
