CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'COMPANY');

ALTER TABLE "users"
ADD COLUMN "client_type" "ClientType",
ADD COLUMN "nif" TEXT;

UPDATE "users"
SET "client_type" = 'INDIVIDUAL'
WHERE "role" = 'CLIENT';
