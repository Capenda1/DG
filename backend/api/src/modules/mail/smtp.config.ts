import type { SmtpConfig, SmtpEnvInput } from './smtp.types';

const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = '587';

function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/** Lê EMAIL_* (Gmail) com fallback para SMTP_* legado. */
export function readSmtpEnvFromProcess(
  env: NodeJS.ProcessEnv = process.env,
): SmtpEnvInput {
  const user = env.EMAIL_USER || env.SMTP_USER;
  const from =
    env.EMAIL_FROM?.trim() ||
    env.MAIL_FROM?.trim() ||
    (user?.trim() ? `Dádiva Go <${user.trim()}>` : '');
  return {
    host: env.EMAIL_HOST || env.SMTP_HOST || GMAIL_SMTP_HOST,
    port: env.EMAIL_PORT || env.SMTP_PORT || GMAIL_SMTP_PORT,
    secure: env.EMAIL_SECURE ?? env.SMTP_SECURE,
    requireTls: env.EMAIL_REQUIRE_TLS ?? env.SMTP_REQUIRE_TLS,
    user,
    pass: env.EMAIL_PASS || env.SMTP_PASS,
    rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
    from,
    appName: env.MAIL_APP_NAME?.trim() || 'Dádiva Go',
  };
}

/** SMTP activo quando há utilizador e palavra-passe (ex.: Gmail). */
export function isSmtpConfigured(env: SmtpEnvInput): boolean {
  return Boolean(env.user?.trim() && env.pass?.trim());
}

export function isSmtpProductionReady(env: SmtpEnvInput): boolean {
  return isSmtpConfigured(env);
}

export function buildSmtpConfig(env: SmtpEnvInput): SmtpConfig | null {
  const user = env.user?.trim();
  const pass = env.pass?.trim();
  if (!user || !pass) {
    return null;
  }

  const hostRaw = (env.host?.trim() || GMAIL_SMTP_HOST).toLowerCase();
  const host = hostRaw === 'localhost' ? '127.0.0.1' : hostRaw;

  const port = parseInt(env.port?.trim() || GMAIL_SMTP_PORT, 10);
  const secure = parseBoolean(env.secure, port === 465);
  const requireTls = parseBoolean(
    env.requireTls,
    !secure && port === 587,
  );
  const rejectUnauthorized = parseBoolean(env.rejectUnauthorized, true);

  return {
    host,
    port,
    secure,
    requireTls,
    user,
    pass,
    rejectUnauthorized,
  };
}
