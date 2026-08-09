import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Twilio from 'twilio';
import { SettingsService } from '../settings/settings.service';
import { analyzeTwilioSmsFrom } from './twilio-sms.util';

/** Valor recomendado para Angola (sender alfanumérico, máx. 11 caracteres). */
export const TWILIO_RECOMMENDED_SENDER_AO = 'GRAF DADIVA';

export type TwilioSmsStatusView = {
  enabled: boolean;
  configured: boolean;
  smsFrom: string | null;
  missing: string[];
  senderKind: 'alphanumeric' | 'phone' | null;
  isUsNumber: boolean;
  recommendedForAngola: boolean;
  oneWayChannel: boolean;
  warnings: string[];
  recommendedSender: string;
  setupGuidePath: string;
  configSource: 'database' | 'env' | null;
};

@Injectable()
export class TwilioSmsService implements OnModuleInit {
  private readonly logger = new Logger(TwilioSmsService.name);

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit(): Promise<void> {
    // Não bloquear o listen — log assíncrono após o arranque.
    void this.logStatusOnBoot();
  }

  private async logStatusOnBoot(): Promise<void> {
    try {
      const status = await this.getStatus();
      if (!status.enabled) {
        this.logger.warn(
          `Twilio SMS inactivo — ${status.missing.join('; ') || 'configuração incompleta'}. Ver docs/TWILIO-SMS-ANGOLA.md`,
        );
        return;
      }

      const fromLabel = status.smsFrom?.startsWith('+')
        ? status.smsFrom
        : `"${status.smsFrom}"`;
      this.logger.log(
        `Twilio SMS activo (remetente: ${fromLabel}, canal ${status.oneWayChannel ? 'único' : 'bidireccional'}, origem: ${status.configSource ?? 'n/d'}).`,
      );

      for (const w of status.warnings) {
        this.logger.warn(`Twilio: ${w}`);
      }
    } catch (err) {
      this.logger.warn(
        `Twilio: não foi possível ler o estado no arranque (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }

  async getStatus(): Promise<TwilioSmsStatusView> {
    const runtime = await this.settings.resolveTwilioSmsRuntimeConfig();
    const missing: string[] = [];

    if (!runtime) {
      missing.push(
        'Activa Twilio em Admin → SMS ou define TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_SMS_FROM',
      );
      return {
        enabled: false,
        configured: false,
        smsFrom: null,
        missing,
        senderKind: null,
        isUsNumber: false,
        recommendedForAngola: false,
        oneWayChannel: false,
        warnings: [],
        recommendedSender: TWILIO_RECOMMENDED_SENDER_AO,
        setupGuidePath: 'docs/TWILIO-SMS-ANGOLA.md',
        configSource: null,
      };
    }

    const smsFrom = runtime.smsFrom;
    const analysis = analyzeTwilioSmsFrom(smsFrom);

    return {
      enabled: runtime.enabled,
      configured: true,
      smsFrom,
      missing: [],
      senderKind: analysis.kind,
      isUsNumber: analysis.isUsNumber,
      recommendedForAngola: analysis.isRecommendedForAngola,
      oneWayChannel: analysis.isOneWayChannel,
      warnings: analysis.warnings,
      recommendedSender: TWILIO_RECOMMENDED_SENDER_AO,
      setupGuidePath: 'docs/TWILIO-SMS-ANGOLA.md',
      configSource: runtime.source,
    };
  }

  async isConfigured(): Promise<boolean> {
    const runtime = await this.settings.resolveTwilioSmsRuntimeConfig();
    return runtime != null;
  }

  async isEnabled(): Promise<boolean> {
    const runtime = await this.settings.resolveTwilioSmsRuntimeConfig();
    return runtime?.enabled === true;
  }

  async sendSms(toE164: string, body: string): Promise<{ sid: string }> {
    const runtime = await this.settings.resolveTwilioSmsRuntimeConfig();
    if (!runtime?.enabled) {
      throw new Error('Twilio SMS não está configurado ou está desactivado.');
    }

    const from = runtime.smsFrom;
    const analysis = analyzeTwilioSmsFrom(from);
    if (!analysis.isOneWayChannel) {
      throw new Error(
        `SMS em canal único — use sender alfanumérico (ex.: ${TWILIO_RECOMMENDED_SENDER_AO}). Remetentes numéricos permitem resposta do cliente.`,
      );
    }
    if (analysis.isUsNumber && toE164.startsWith('+244')) {
      this.logger.warn(
        `A enviar SMS de número +1 para Angola — considere sender ${TWILIO_RECOMMENDED_SENDER_AO}.`,
      );
    }

    const client = Twilio(runtime.accountSid, runtime.authToken);
    const message = await client.messages.create({
      to: toE164,
      from,
      body,
    });

    this.logger.log(`SMS Twilio enviado (${message.sid}) para ${toE164}`);
    return { sid: message.sid };
  }
}
