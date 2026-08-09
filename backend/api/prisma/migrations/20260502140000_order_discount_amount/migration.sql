-- Desconto em pedidos (usado no PDV; valor total = linhas − desconto)
ALTER TABLE "orders" ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
