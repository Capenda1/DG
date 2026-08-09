import type { MailProvider } from './mail.types';
import { isSmtpConfigured, readSmtpEnvFromProcess } from './smtp.config';

export function resolveMailProvider(
  rawProvider: string | undefined,
  env: {
    resendApiKey?: string;
  } = {},
): MailProvider {
  const provider = (rawProvider ?? 'auto').trim().toLowerCase();
  const smtpReady = isSmtpConfigured(readSmtpEnvFromProcess());

  if (provider === 'none') {
    return 'none';
  }
  if (provider === 'resend') {
    return env.resendApiKey ? 'resend' : 'none';
  }
  if (provider === 'smtp') {
    return smtpReady ? 'smtp' : 'none';
  }

  if (env.resendApiKey) {
    return 'resend';
  }
  if (smtpReady) {
    return 'smtp';
  }
  return 'none';
}
