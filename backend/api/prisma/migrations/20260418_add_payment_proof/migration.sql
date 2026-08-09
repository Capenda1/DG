-- AlterTable
ALTER TABLE "orders"
  ADD COLUMN "payment_proof_key"  TEXT,
  ADD COLUMN "payment_proof_name" TEXT,
  ADD COLUMN "payment_proof_mime" TEXT;
