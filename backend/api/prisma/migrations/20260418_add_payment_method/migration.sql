-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER_SAME', 'DEPOSIT', 'BANK_TRANSFER_EXPRESS', 'CASH_ON_SITE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_method" "PaymentMethod";
