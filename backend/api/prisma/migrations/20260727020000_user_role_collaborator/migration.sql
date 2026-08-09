-- Colaboradores internos (ex.: segurança, faccionistas) — RH sem acesso ao sistema.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COLLABORATOR';
