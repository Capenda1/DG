-- Fase 2: documentos PDF (numeração + histórico de emissões)

CREATE TYPE "InvoiceDocumentModel" AS ENUM (
  'FACTURA_POR_FORMA',
  'FACTURA_RECIBO',
  'FACTURA'
);

CREATE TYPE "OrderDocumentIssueAction" AS ENUM ('PRINT', 'DOWNLOAD', 'SHARE');

ALTER TABLE "orders"
  ADD COLUMN "last_document_model" "InvoiceDocumentModel",
  ADD COLUMN "last_document_number" TEXT,
  ADD COLUMN "last_document_issued_at" TIMESTAMP(3);

CREATE TABLE "order_document_sequences" (
  "id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "model" "InvoiceDocumentModel" NOT NULL,
  "last_seq" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_document_sequences_year_model_key"
  ON "order_document_sequences"("year", "model");

CREATE TABLE "order_document_issues" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "document_model" "InvoiceDocumentModel" NOT NULL,
  "document_number" TEXT NOT NULL,
  "sequence_year" INTEGER NOT NULL,
  "sequence_num" INTEGER NOT NULL,
  "action" "OrderDocumentIssueAction" NOT NULL,
  "issued_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_document_issues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_document_issues_order_id_created_at_idx"
  ON "order_document_issues"("order_id", "created_at");
CREATE INDEX "order_document_issues_document_number_idx"
  ON "order_document_issues"("document_number");
CREATE INDEX "order_document_issues_created_at_idx"
  ON "order_document_issues"("created_at");

ALTER TABLE "order_document_issues"
  ADD CONSTRAINT "order_document_issues_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_document_issues"
  ADD CONSTRAINT "order_document_issues_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
