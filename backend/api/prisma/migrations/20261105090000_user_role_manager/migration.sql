-- Gerente: acesso operacional sem gestão de utilizadores nem configurações globais.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';
