-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'DESIGNER', 'PRODUCTION', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWAITING_DESIGNER', 'CLIENT_EDITING', 'AWAITING_CLIENT', 'ADJUSTMENTS_REQUESTED', 'APPROVED_FOR_PRODUCTION', 'IN_QUEUE', 'PRINTING', 'FINISHING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ArtVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductionProcess" AS ENUM ('SUBLIMATION', 'DTF');

-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('COMMENT', 'INTERNAL_NOTE', 'ATTACHMENT_REF');

-- CreateEnum
CREATE TYPE "OrderSlaType" AS ENUM ('DESIGN_REVIEW', 'CLIENT_RESPONSE', 'PRODUCTION', 'SHIPPING');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE_ART', 'LOGIN', 'LOGOUT', 'SESSION_REVOKE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "designer_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "tracking_code" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "sku_code" TEXT,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "production_process" "ProductionProcess" NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "art_versions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "version_index" INTEGER NOT NULL,
    "status" "ArtVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "storage_key" TEXT,
    "preview_key" TEXT,
    "checksum" TEXT,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "art_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" UUID NOT NULL,
    "art_version_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "AnnotationKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "attachment_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_checklist_items" (
    "id" UUID NOT NULL,
    "art_version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_by_id" UUID,
    "checked_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "technical_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_slas" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "OrderSlaType" NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "met_at" TIMESTAMP(3),
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "order_slas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_usage" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,

    CONSTRAINT "consumable_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "carrier" TEXT,
    "service" TEXT,
    "tracking_code" TEXT,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "shipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");

-- CreateIndex
CREATE INDEX "orders_designer_id_idx" ON "orders"("designer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "art_versions_order_id_idx" ON "art_versions"("order_id");

-- CreateIndex
CREATE INDEX "art_versions_status_idx" ON "art_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "art_versions_order_id_version_index_key" ON "art_versions"("order_id", "version_index");

-- CreateIndex
CREATE INDEX "annotations_art_version_id_idx" ON "annotations"("art_version_id");

-- CreateIndex
CREATE INDEX "annotations_author_id_idx" ON "annotations"("author_id");

-- CreateIndex
CREATE INDEX "technical_checklist_items_art_version_id_idx" ON "technical_checklist_items"("art_version_id");

-- CreateIndex
CREATE INDEX "order_slas_order_id_idx" ON "order_slas"("order_id");

-- CreateIndex
CREATE INDEX "order_slas_due_at_idx" ON "order_slas"("due_at");

-- CreateIndex
CREATE INDEX "consumable_usage_order_id_idx" ON "consumable_usage"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_order_id_key" ON "shipping"("order_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_order_id_idx" ON "audit_logs"("order_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_designer_id_fkey" FOREIGN KEY ("designer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "art_versions" ADD CONSTRAINT "art_versions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "art_versions" ADD CONSTRAINT "art_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "art_versions" ADD CONSTRAINT "art_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_art_version_id_fkey" FOREIGN KEY ("art_version_id") REFERENCES "art_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "annotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_checklist_items" ADD CONSTRAINT "technical_checklist_items_art_version_id_fkey" FOREIGN KEY ("art_version_id") REFERENCES "art_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_checklist_items" ADD CONSTRAINT "technical_checklist_items_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_slas" ADD CONSTRAINT "order_slas_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_usage" ADD CONSTRAINT "consumable_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_usage" ADD CONSTRAINT "consumable_usage_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping" ADD CONSTRAINT "shipping_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
