-- Módulo financeiro (enxuto): razão de vendas + turno de caixa PDV
CREATE TYPE "FinancialLedgerEntryType" AS ENUM ('sale_payment');
CREATE TYPE "PdvCashSessionStatus" AS ENUM ('open', 'closed');

CREATE TABLE "pdv_cash_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "PdvCashSessionStatus" NOT NULL,
    "opening_float" DECIMAL(12,2) NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "declared_cash" DECIMAL(12,2),
    "expected_cash" DECIMAL(12,2),
    "cash_difference" DECIMAL(12,2),
    "close_notes" TEXT,

    CONSTRAINT "pdv_cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_type" "FinancialLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'AOA',
    "order_id" UUID,
    "user_id" UUID,
    "pdv_session_id" UUID,
    "reference" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pdv_cash_sessions" ADD CONSTRAINT "pdv_cash_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pdv_cash_sessions" ADD CONSTRAINT "pdv_cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_pdv_session_id_fkey" FOREIGN KEY ("pdv_session_id") REFERENCES "pdv_cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "financial_ledger_entries_created_at_idx" ON "financial_ledger_entries"("created_at");
CREATE INDEX "financial_ledger_entries_order_id_idx" ON "financial_ledger_entries"("order_id");
CREATE INDEX "financial_ledger_entries_pdv_session_id_idx" ON "financial_ledger_entries"("pdv_session_id");
CREATE INDEX "financial_ledger_entries_entry_type_created_at_idx" ON "financial_ledger_entries"("entry_type", "created_at");

CREATE INDEX "pdv_cash_sessions_status_idx" ON "pdv_cash_sessions"("status");
CREATE INDEX "pdv_cash_sessions_opened_at_idx" ON "pdv_cash_sessions"("opened_at");
