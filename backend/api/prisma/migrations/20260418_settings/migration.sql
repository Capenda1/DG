CREATE TABLE "settings" (
  "key"        TEXT        NOT NULL,
  "value"      JSONB       NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- Seed inicial com dados em branco
INSERT INTO "settings" ("key","value") VALUES
  ('payment_settings', '{
    "bankTransferSame":    { "accountNumber": "", "accountName": "", "bankName": "" },
    "deposit":             { "accountNumber": "", "bankName": "" },
    "bankTransferExpress": { "expressNumber": "", "provider": "" }
  }')
ON CONFLICT ("key") DO NOTHING;
