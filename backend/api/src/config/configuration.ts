function parseCorsOrigin(raw: string | undefined): string | string[] {
  const fallback = 'http://localhost:3000';
  const parts = (raw ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0];
  return parts;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  /** Pasta base para uploads (modelagem cliente). */
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxModelagemUploadMb: parseInt(
    process.env.MAX_MODELAGEM_UPLOAD_MB ?? '15',
    10,
  ),
  /** Obrigatório em produção para POST /api/auth/bootstrap (primeiro admin). */
  bootstrapAdminSecret: process.env.BOOTSTRAP_ADMIN_SECRET ?? '',
  /**
   * Se true, contas ADMIN sem MFA recebem mfaSetupRequired em /auth/me
   * e o frontend redirecciona para a configuração TOTP.
   */
  mfaRequireAdmin:
    process.env.MFA_REQUIRE_ADMIN === '1' ||
    process.env.MFA_REQUIRE_ADMIN?.toLowerCase() === 'true',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-change-in-production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpiresDays: parseInt(
      process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7',
      10,
    ),
  },
  /** URL pública do frontend (links de recuperação de palavra-passe). */
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')[0]
    .trim(),
  mail: {
    provider: (process.env.MAIL_PROVIDER ?? 'smtp').trim().toLowerCase(),
    passwordResetCodeMinutes: parseInt(
      process.env.MAIL_PASSWORD_RESET_CODE_MINUTES ?? '10',
      10,
    ),
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    /**
     * SMTP por defeito (.env) — usado enquanto o admin não activar
     * Configurações → Email na base de dados.
     * Variáveis: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
     */
    smtpEnvDefaults: {
      host:
        process.env.EMAIL_HOST ||
        process.env.SMTP_HOST ||
        'smtp.gmail.com',
      port: parseInt(
        process.env.EMAIL_PORT || process.env.SMTP_PORT || '587',
        10,
      ),
      secure:
        process.env.EMAIL_SECURE === '1' ||
        process.env.EMAIL_SECURE?.toLowerCase() === 'true' ||
        process.env.SMTP_SECURE === '1' ||
        process.env.SMTP_SECURE?.toLowerCase() === 'true',
      requireTls:
        process.env.EMAIL_REQUIRE_TLS === '1' ||
        process.env.EMAIL_REQUIRE_TLS?.toLowerCase() === 'true' ||
        process.env.SMTP_REQUIRE_TLS === '1' ||
        process.env.SMTP_REQUIRE_TLS?.toLowerCase() === 'true',
      user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
      from:
        process.env.EMAIL_FROM?.trim() ||
        process.env.MAIL_FROM?.trim() ||
        '',
      appName: process.env.MAIL_APP_NAME ?? 'Dádiva Go',
    },
    from:
      process.env.EMAIL_FROM?.trim() ||
      process.env.MAIL_FROM?.trim() ||
      (process.env.EMAIL_USER?.trim()
        ? `Dádiva Go <${process.env.EMAIL_USER.trim()}>`
        : ''),
    appName: process.env.MAIL_APP_NAME ?? 'Dádiva Go',
    smtp: {
      host:
        process.env.EMAIL_HOST ||
        process.env.SMTP_HOST ||
        'smtp.gmail.com',
      port: parseInt(
        process.env.EMAIL_PORT || process.env.SMTP_PORT || '587',
        10,
      ),
      secure:
        process.env.EMAIL_SECURE === undefined &&
        process.env.SMTP_SECURE === undefined
          ? undefined
          : process.env.EMAIL_SECURE === '1' ||
            process.env.EMAIL_SECURE?.toLowerCase() === 'true' ||
            process.env.SMTP_SECURE === '1' ||
            process.env.SMTP_SECURE?.toLowerCase() === 'true',
      requireTls:
        process.env.EMAIL_REQUIRE_TLS === undefined &&
        process.env.SMTP_REQUIRE_TLS === undefined
          ? undefined
          : process.env.EMAIL_REQUIRE_TLS === '1' ||
            process.env.EMAIL_REQUIRE_TLS?.toLowerCase() === 'true' ||
            process.env.SMTP_REQUIRE_TLS === '1' ||
            process.env.SMTP_REQUIRE_TLS?.toLowerCase() === 'true',
      user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
      pass: process.env.EMAIL_PASS || process.env.SMTP_PASS || '',
      rejectUnauthorized:
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED === undefined
          ? undefined
          : process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== '0' &&
            process.env.SMTP_TLS_REJECT_UNAUTHORIZED.toLowerCase() !== 'false',
    },
  },
  /** SMS Twilio — aviso ao cliente quando pedido está finalizado. */
  twilio: {
    enabled: (process.env.TWILIO_SMS_ENABLED ?? 'true').trim().toLowerCase(),
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    /** Angola: «GRAF DADIVA» (alfanumérico, máx. 11) ou +244… Ver docs/TWILIO-SMS-ANGOLA.md */
    smsFrom: process.env.TWILIO_SMS_FROM ?? 'GRAF DADIVA',
  },
});
