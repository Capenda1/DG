-- MFA TOTP: secret cifrado + hashes de códigos de recuperação
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret_enc" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_recovery_hashes" TEXT;
