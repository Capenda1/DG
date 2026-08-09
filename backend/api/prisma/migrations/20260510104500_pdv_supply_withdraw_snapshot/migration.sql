-- Movimentação de numerário durante o turno (suprimentos/saídas) + relatório Z persistido ao fecho
ALTER TYPE "FinancialLedgerEntryType" ADD VALUE 'pdv_supplement';
ALTER TYPE "FinancialLedgerEntryType" ADD VALUE 'pdv_withdrawal';

ALTER TABLE "pdv_cash_sessions" ADD COLUMN "closing_snapshot" JSONB;
