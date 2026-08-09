export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  pass?: string;
  /** Validar certificado TLS (desactive só em dev local). */
  rejectUnauthorized: boolean;
};

export type SmtpEnvInput = {
  host?: string;
  port?: string;
  secure?: string;
  requireTls?: string;
  user?: string;
  pass?: string;
  rejectUnauthorized?: string;
  from?: string;
  appName?: string;
};
