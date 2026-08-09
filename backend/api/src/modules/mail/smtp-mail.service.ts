import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { buildSmtpConfig } from './smtp.config';
import { mapSmtpSendError } from './smtp.errors';
import type { SendMailPayload } from './mail.types';
import { MailConfigService } from './mail-config.service';

@Injectable()
export class SmtpMailService implements OnModuleInit {
  private readonly logger = new Logger(SmtpMailService.name);
  private transport: Transporter | null = null;
  private transportKey = '';

  constructor(private readonly mailConfig: MailConfigService) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.mailConfig.isConfigured())) {
      this.logger.warn('SMTP não configurado (.env ou Configurações → Email).');
      return;
    }
    if (process.env.SMTP_VERIFY_ON_START === 'false') {
      return;
    }
    try {
      await this.verifyConnection();
      this.logger.log('Ligação SMTP verificada.');
    } catch (err) {
      const mapped = mapSmtpSendError(err);
      this.logger.warn(`SMTP no arranque: ${mapped.message}`);
    }
  }

  async verifyConnection(): Promise<void> {
    const transport = await this.resolveTransport();
    await transport.verify();
  }

  async sendMail(from: string, payload: SendMailPayload): Promise<void> {
    const transport = await this.resolveTransport();
    try {
      await transport.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
    } catch (err) {
      throw mapSmtpSendError(err);
    }
  }

  private async resolveTransport(): Promise<Transporter> {
    const env = await this.mailConfig.getSmtpEnv();
    const smtpConfig = buildSmtpConfig(env ?? {});
    if (!smtpConfig) {
      throw new Error(
        'SMTP não configurado. Use Configurações → Email ou variáveis EMAIL_* no .env.',
      );
    }

    const key = JSON.stringify({
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    });
    if (this.transport && this.transportKey === key) {
      return this.transport;
    }

    this.transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      requireTLS: smtpConfig.requireTls,
      auth: {
        user: smtpConfig.user!,
        pass: smtpConfig.pass!,
      },
      tls: {
        rejectUnauthorized: smtpConfig.rejectUnauthorized,
      },
    });
    this.transportKey = key;
    return this.transport;
  }
}
