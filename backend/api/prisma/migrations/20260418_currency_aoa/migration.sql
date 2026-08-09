-- Altera o default de currency para AOA nos novos registos
ALTER TABLE "orders"           ALTER COLUMN "currency" SET DEFAULT 'AOA';
ALTER TABLE "product_variants" ALTER COLUMN "currency" SET DEFAULT 'AOA';

-- Actualiza pedidos existentes que usavam EUR
UPDATE "orders"           SET currency = 'AOA' WHERE currency = 'EUR';
UPDATE "product_variants" SET currency = 'AOA' WHERE currency = 'EUR';
