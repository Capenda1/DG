-- Fluxo de caixa: outros movimentos no razão + saldo tesouraria + projeções
ALTER TYPE "FinancialLedgerEntryType" ADD VALUE 'cash_receipt_other';
ALTER TYPE "FinancialLedgerEntryType" ADD VALUE 'cash_expense';

CREATE TYPE "CashFlowProjectionDirection" AS ENUM ('in', 'out');

CREATE TABLE "treasury_opening_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AOA',
    "notes" VARCHAR(2000),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_opening_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treasury_opening_balances_snapshot_date_key" ON "treasury_opening_balances"("snapshot_date");

CREATE TABLE "cash_flow_projections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expected_date" DATE NOT NULL,
    "direction" "CashFlowProjectionDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AOA',
    "category" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "cash_flow_projections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_flow_projections_expected_date_idx" ON "cash_flow_projections"("expected_date");

ALTER TABLE "cash_flow_projections" ADD CONSTRAINT "cash_flow_projections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
