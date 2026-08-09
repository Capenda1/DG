/**
 * Validação de variáveis de ambiente antes do arranque da API (Fase 0 — estabilização base).
 * Falha de forma explícita com mensagens acionáveis.
 */

import { resolveMailProvider } from '../modules/mail/mail-provider.util';
import {
  isSmtpProductionReady,
  readSmtpEnvFromProcess,
} from '../modules/mail/smtp.config';

const FORBIDDEN_JWT_SECRETS = new Set(
  [
    'dev-only-change-in-production',
    'altere-para-uma-string-longa-e-aleatoria',
    'secret',
    'changeme',
    'password',
    'jwt_secret',
  ].map((s) => s.toLowerCase()),
);

const MIN_JWT_SECRET_LENGTH_PROD = 32;

function resolveMailFromEnv(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    (process.env.EMAIL_USER?.trim()
      ? `Dádiva Go <${process.env.EMAIL_USER.trim()}>`
      : '')
  );
}

export function assertEnvForStartup(): void {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      '[env] DATABASE_URL é obrigatória. Copie env.sample para .env na pasta api/ e configure o PostgreSQL (ver docs/SETUP.md).',
    );
  }

  const isProd = process.env.NODE_ENV === 'production';
  const jwtRaw = process.env.JWT_SECRET ?? '';
  const jwtSecret = jwtRaw.trim();

  if (isProd) {
    if (!jwtSecret) {
      throw new Error(
        '[env] JWT_SECRET é obrigatório em produção. Gere um segredo aleatório (≥32 caracteres).',
      );
    }
    if (FORBIDDEN_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
      throw new Error(
        '[env] JWT_SECRET usa um valor de exemplo ou fraco. Não use valores do env.sample em produção.',
      );
    }
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH_PROD) {
      throw new Error(
        `[env] JWT_SECRET em produção deve ter pelo menos ${MIN_JWT_SECRET_LENGTH_PROD} caracteres.`,
      );
    }

    const cors = process.env.CORS_ORIGIN?.trim();
    if (!cors) {
      throw new Error(
        '[env] CORS_ORIGIN é obrigatório em produção (origem exata do frontend, ex.: https://app.empresa.com).',
      );
    }
    if (cors === '*') {
      throw new Error(
        '[env] CORS_ORIGIN não pode ser "*" em produção com credentials habilitadas.',
      );
    }

    assertMailEnvForProduction();
  }
}

function assertMailEnvForProduction(): void {
  const providerRaw = process.env.MAIL_PROVIDER?.trim().toLowerCase() ?? 'auto';
  if (providerRaw === 'none') {
    throw new Error(
      '[env] MAIL_PROVIDER=none não é permitido em produção — configure Gmail ou Resend para recuperação de palavra-passe.',
    );
  }

  const mailFrom = resolveMailFromEnv();
  if (!mailFrom) {
    throw new Error(
      '[env] EMAIL_FROM, MAIL_FROM ou EMAIL_USER é obrigatório em produção.',
    );
  }

  const resolved = resolveMailProvider(providerRaw, {
    resendApiKey: process.env.RESEND_API_KEY,
  });

  if (resolved === 'none') {
    throw new Error(
      '[env] Configure envio de email em produção: EMAIL_USER/EMAIL_PASS (Gmail) ou RESEND_API_KEY (ver backend/api/env.sample).',
    );
  }

  if (resolved === 'smtp' && !isSmtpProductionReady(readSmtpEnvFromProcess())) {
    throw new Error(
      '[env] Gmail/SMTP em produção exige EMAIL_USER e EMAIL_PASS (Senha de App).',
    );
  }

  const appPublicUrl =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  if (!appPublicUrl) {
    throw new Error(
      '[env] APP_PUBLIC_URL ou CORS_ORIGIN é necessário para links de recuperação de palavra-passe.',
    );
  }
}
