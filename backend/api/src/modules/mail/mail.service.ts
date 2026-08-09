import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MailProvider,
  PasswordResetCodeMailPayload,
  SendMailPayload,
} from './mail.types';
import { resolveMailProvider } from './mail-provider.util';
import { buildPasswordResetCodeMail } from './password-reset-code.template';
import { MailConfigService } from './mail-config.service';
import { SmtpMailService } from './smtp-mail.service';

@Injectable()
export class MailService {
  constructor(
    private readonly config: ConfigService,
    private readonly smtp: SmtpMailService,
    private readonly mailConfig: MailConfigService,
  ) {}

  async getProvider(): Promise<MailProvider> {
    if (await this.mailConfig.isConfigured()) {
      return 'smtp';
    }
    return resolveMailProvider(this.config.get<string>('mail.provider'), {
      resendApiKey: this.config.get<string>('mail.resendApiKey'),
    });
  }

  async isConfigured(): Promise<boolean> {
    const provider = await this.getProvider();
    return provider !== 'none';
  }

  async sendPasswordResetCodeEmail(
    payload: PasswordResetCodeMailPayload,
  ): Promise<void> {
    const appName = await this.mailConfig.getAppName(
      this.config.get<string>('mail.appName') ?? 'Dádiva Go',
    );
    const expiresMinutes =
      this.config.get<number>('mail.passwordResetCodeMinutes') ?? 10;
    const content = buildPasswordResetCodeMail({
      recipientName: payload.recipientName,
      code: payload.code,
      appName,
      expiresMinutes,
    });

    await this.sendMail({
      to: payload.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  }

  private async sendMail(payload: SendMailPayload): Promise<void> {
    const fallbackFrom = this.config.get<string>('mail.from')?.trim() ?? '';
    const from = (await this.mailConfig.getFromAddress(fallbackFrom)) || fallbackFrom;
    if (!from) {
      throw new Error('Remetente (from) não configurado.');
    }

    const provider = await this.getProvider();
    if (provider === 'none') {
      throw new Error('Serviço de email não configurado.');
    }

    if (provider === 'resend') {
      await this.sendViaResend(from, payload);
      return;
    }

    await this.smtp.sendMail(from, payload);
  }

  private async sendViaResend(
    from: string,
    payload: SendMailPayload,
  ): Promise<void> {
    const apiKey = this.config.get<string>('mail.resendApiKey')?.trim();
    if (!apiKey) {
      throw new Error('RESEND_API_KEY não está configurado.');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Resend rejeitou o envio (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
  }
}
