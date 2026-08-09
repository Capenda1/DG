import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  isSmtpConfigured,
  readSmtpEnvFromProcess,
} from './smtp.config';
import type { SmtpEnvInput } from './smtp.types';

@Injectable()
export class MailConfigService {
  constructor(private readonly settings: SettingsService) {}

  /** Configuração efectiva: base de dados (admin) ou variáveis de ambiente (.env). */
  async getSmtpEnv(): Promise<SmtpEnvInput | null> {
    const fromDb = await this.settings.getSmtpSettingsForMail();
    if (fromDb && isSmtpConfigured(fromDb)) {
      return fromDb;
    }
    const fromEnv = readSmtpEnvFromProcess();
    return isSmtpConfigured(fromEnv) ? fromEnv : null;
  }

  async isConfigured(): Promise<boolean> {
    const env = await this.getSmtpEnv();
    return env !== null && isSmtpConfigured(env);
  }

  async getFromAddress(fallback = ''): Promise<string> {
    const env = await this.getSmtpEnv();
    return env?.from?.trim() || fallback;
  }

  async getAppName(fallback = 'Dádiva Go'): Promise<string> {
    const env = await this.getSmtpEnv();
    return env?.appName?.trim() || fallback;
  }
}
