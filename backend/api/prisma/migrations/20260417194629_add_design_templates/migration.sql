-- CreateEnum
CREATE TYPE "DesignTemplateCategory" AS ENUM ('SPORT', 'CASUAL', 'CORPORATE', 'KIDS', 'EVENTS', 'OTHER');

-- CreateTable
CREATE TABLE "design_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DesignTemplateCategory" NOT NULL DEFAULT 'OTHER',
    "garment_type" TEXT,
    "preview_key" TEXT,
    "layers_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_templates_active_sort_order_idx" ON "design_templates"("active", "sort_order");

-- CreateIndex
CREATE INDEX "design_templates_category_idx" ON "design_templates"("category");

-- AddForeignKey
ALTER TABLE "design_templates" ADD CONSTRAINT "design_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
