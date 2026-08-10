import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';

/** Dados da empresa (nome, marca, contactos, redes) — chave JSON `business_profile`. */
export interface BusinessProfileSettings {
  companyName: string;
  /** Razão social / denominação legal (facturação). */
  legalName: string;
  tagline: string;
  /**
   * Logótipo: URL externa (`https://…`), ficheiro em `/public` (`/imagens/logo.png`)
   * ou servidor API após upload (`/api/settings/branding/{uuid}.ext`).
   */
  logoUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  provinceRegion: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  /** NIF / contribuinte. */
  taxId: string;
  /** Horário de funcionamento (texto livre). */
  businessHours: string;
  socialFacebook: string;
  socialInstagram: string;
  /** Notas internas (opcional): políticas resumidas, etc. */
  notes: string;
  /**
   * Linha de certificação AGT (ex.: «L3+3 – Processado por programa certificado nº …/AGT/2020 …»).
   * Impressa no rodapé de facturas, recibos e documentos do sistema.
   */
  agtCertificationLine: string;
}

/** Dados institucionais normalizados para PDFs, relatórios e exports. */
export interface DocumentBranding {
  displayName: string;
  legalName: string;
  tagline: string;
  logoUrl: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** NIF, morada e contacto — ordem fixa. */
  identityLines: string[];
  /** Licença AGT — rodapé legal em documentos. */
  agtCertificationLine: string;
}

/** Aparência da página de login — chave JSON `login_appearance`. */
export interface LoginAppearanceSettings {
  /** Só `/api/settings/branding/{uuid}.ext` após upload; vazio = imagem predefinida do site. */
  backgroundUrl: string;
  /** Intensidade do overlay sobre a foto (0–100). */
  overlayOpacity: number;
  /** ISO 8601 — invalidação de cache no cliente. */
  updatedAt: string;
}

/** Resposta pública mínima para `/login` (sem autenticação). */
export type LoginBrandingPublic = LoginAppearanceSettings;

export type LoginAppearanceUpdate = {
  overlayOpacity?: number;
};

const DEFAULT_COMPANY_NAME = 'Dádiva Go';

export interface PaymentSettings {
  bankTransferSame: {
    enabled: boolean;
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  deposit: {
    enabled: boolean;
    accountNumber: string;
    bankName: string;
  };
  bankTransferExpress: {
    enabled: boolean;
    expressNumber: string;
    provider: string;
  };
  whatsappNumber: string;
  /** Formato do PDF do comprovante em toda a loja (impressão). */
  receiptPaperFormat: 'A4' | 'A4_BW' | 'A5_BW' | 'THERMAL_80' | 'THERMAL_58_BW';
}

/** Checkout do cliente: mesmo conteúdo operacional, sem formato de papel do comprovante. */
export type ClientCheckoutPaymentSettings = Omit<
  PaymentSettings,
  'receiptPaperFormat'
>;

const PAYMENT_KEY = 'payment_settings';
const BUSINESS_KEY = 'business_profile';
const LOGIN_APPEARANCE_KEY = 'login_appearance';
const SMTP_MAIL_KEY = 'smtp_mail';
const TWILIO_SMS_KEY = 'twilio_sms';

const DEFAULT_LOGIN_OVERLAY = 70;

const DEFAULT_LOGIN_APPEARANCE: LoginAppearanceSettings = {
  backgroundUrl: '',
  overlayOpacity: DEFAULT_LOGIN_OVERLAY,
  updatedAt: '',
};

/** SMS Twilio configurável pelo admin (substitui .env quando `enabled`). */
export interface TwilioSmsSettings {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  smsFrom: string;
  /** Placeholders: {empresa}, {pedido}, {contacto}, {rodape} */
  messageTemplate: string;
  oneWayFooter: string;
}

export type TwilioSmsSettingsPublic = Omit<TwilioSmsSettings, 'authToken'> & {
  hasAuthToken: boolean;
  configSource: 'database' | 'env';
};

export type TwilioSmsSettingsUpdate = Partial<
  Omit<TwilioSmsSettings, 'authToken'>
> & {
  /** Só altera se enviado (vazio = manter actual). */
  authToken?: string;
};

export type TwilioSmsRuntimeConfig = {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  smsFrom: string;
  messageTemplate: string;
  oneWayFooter: string;
  source: 'database' | 'env';
};

export const DEFAULT_TWILIO_SMS_MESSAGE_TEMPLATE =
  '{empresa}: o pedido {pedido} está finalizado e pronto para recolha.{contacto}{rodape}';

export const DEFAULT_TWILIO_SMS_ONE_WAY_FOOTER =
  ' Canal informativo — não responda a este SMS.';

const DEFAULT_TWILIO_SMS: TwilioSmsSettings = {
  enabled: false,
  accountSid: '',
  authToken: '',
  smsFrom: 'GRAF DADIVA',
  messageTemplate: DEFAULT_TWILIO_SMS_MESSAGE_TEMPLATE,
  oneWayFooter: DEFAULT_TWILIO_SMS_ONE_WAY_FOOTER,
};

/** SMTP configurável pelo admin (substitui .env quando `enabled`). */
export interface SmtpMailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  pass: string;
  from: string;
  appName: string;
}

export type SmtpMailSettingsPublic = Omit<SmtpMailSettings, 'pass'> & {
  hasPassword: boolean;
};

export type SmtpMailSettingsUpdate = Partial<
  Omit<SmtpMailSettings, 'pass' | 'port'>
> & {
  port?: number;
  /** Só altera se enviada (vazia = manter actual). */
  pass?: string;
};

const DEFAULT_SMTP_MAIL: SmtpMailSettings = {
  enabled: false,
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTls: true,
  user: '',
  pass: '',
  from: '',
  appName: 'Dádiva Go',
};

const DEFAULT_PAYMENT: PaymentSettings = {
  bankTransferSame: {
    enabled: true,
    accountNumber: '',
    accountName: '',
    bankName: '',
  },
  deposit: { enabled: true, accountNumber: '', bankName: '' },
  bankTransferExpress: { enabled: true, expressNumber: '', provider: '' },
  whatsappNumber: '',
  receiptPaperFormat: 'THERMAL_80',
};

const DEFAULT_BUSINESS: BusinessProfileSettings = {
  companyName: '',
  legalName: '',
  tagline: '',
  logoUrl: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  provinceRegion: '',
  country: 'Angola',
  phone: '',
  email: '',
  website: '',
  taxId: '',
  businessHours: '',
  socialFacebook: '',
  socialInstagram: '',
  notes: '',
  agtCertificationLine: '',
};

const BUSINESS_FIELDS: (keyof BusinessProfileSettings)[] = [
  'companyName',
  'legalName',
  'tagline',
  'logoUrl',
  'addressLine1',
  'addressLine2',
  'city',
  'provinceRegion',
  'country',
  'phone',
  'email',
  'website',
  'taxId',
  'businessHours',
  'socialFacebook',
  'socialInstagram',
  'notes',
  'agtCertificationLine',
];

function mergeBusinessProfile(
  current: BusinessProfileSettings,
  patch: Partial<BusinessProfileSettings>,
): BusinessProfileSettings {
  const merged = { ...current };
  for (const k of BUSINESS_FIELDS) {
    const v = patch[k];
    if (v !== undefined && typeof v === 'string') {
      merged[k] = v;
    }
  }
  return merged;
}

/** Prefixo público das imagens de logo gravadas pela API (`<img>` sem JWT). */
export const BUSINESS_LOGO_URL_PREFIX = '/api/settings/branding/';

const LOGO_FILENAME_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,8}$/i;

/** Multer memory file for logo uploads. */
export type MemoryUploadedLogo = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class SettingsService {
  private readonly logoAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
  ]);

  /** Fundo de login: raster only (sem SVG). */
  private readonly loginBackgroundAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

  private readonly maxLogoBytes = 3 * 1024 * 1024;
  private readonly maxLoginBackgroundBytes = 5 * 1024 * 1024;
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private logoDirAbsolute(): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'settings', 'branding');
  }

  logoKeyToStoredFilename(logoUrl: string | null | undefined): string | null {
    if (!logoUrl?.startsWith(BUSINESS_LOGO_URL_PREFIX)) {
      return null;
    }
    const name = logoUrl.slice(BUSINESS_LOGO_URL_PREFIX.length);
    const only = decodeURIComponent(name).split(/[/\\]/).pop();
    return only && LOGO_FILENAME_REGEX.test(only) ? only : null;
  }

  async maybeUnlinkStoredLogoFile(
    logoUrl: string | null | undefined,
  ): Promise<void> {
    const fileName = this.logoKeyToStoredFilename(logoUrl);
    if (!fileName) return;
    try {
      await unlink(join(this.logoDirAbsolute(), fileName));
    } catch {
      /* ausente ou permissões */
    }
  }

  private mimeForLogoExt(lowerExt: string): string {
    if (lowerExt === '.png') return 'image/png';
    if (lowerExt === '.jpg' || lowerExt === '.jpeg') return 'image/jpeg';
    if (lowerExt === '.webp') return 'image/webp';
    if (lowerExt === '.svg') return 'image/svg+xml';
    return 'application/octet-stream';
  }

  private extForLogoMime(mime: string): string {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/svg+xml') return '.svg';
    return '.bin';
  }

  /** Grava PNG/JPEG/WebP/SVG em disco e actualiza só `logoUrl` no perfil. */
  async uploadAndPersistBusinessLogo(
    file: MemoryUploadedLogo,
  ): Promise<BusinessProfileSettings> {
    if (!file.buffer?.length) {
      throw new BadRequestException('Envia uma imagem no campo file.');
    }
    if (!this.logoAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo não permitido — usa PNG, JPEG, WEBP ou SVG.',
      );
    }
    if (file.size > this.maxLogoBytes) {
      throw new BadRequestException('Imagem demasiado grande — máximo 3 MB.');
    }

    let ext = extname(file.originalname).toLowerCase();
    ext =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9]+$/.test(ext)
        ? ext
        : this.extForLogoMime(file.mimetype);

    const storageKey = `${randomUUID()}${ext}`;
    const dir = this.logoDirAbsolute();
    await mkdir(dir, { recursive: true });

    const current = await this.getBusinessProfile();
    await this.maybeUnlinkStoredLogoFile(current.logoUrl);

    await writeFile(join(dir, storageKey), file.buffer);

    const logoUrl = `${BUSINESS_LOGO_URL_PREFIX}${storageKey}`;
    return this.updateBusinessProfile({ logoUrl });
  }

  async getStoredLogoReadStream(
    fileName: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const base = decodeURIComponent(fileName.trim());
    const onlyName = base.split(/[/\\]/).pop();
    if (!onlyName || !LOGO_FILENAME_REGEX.test(onlyName)) {
      throw new NotFoundException();
    }
    const fullPath = join(this.logoDirAbsolute(), onlyName);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException();
    }
    const mime = this.mimeForLogoExt(extname(onlyName).toLowerCase());
    return {
      stream: createReadStream(fullPath),
      mimeType: mime,
    };
  }

  /** Apenas para cliente: pagamento e WhatsApp, sem `receiptPaperFormat`. */
  async getClientCheckoutPaymentSettings(): Promise<ClientCheckoutPaymentSettings> {
    const full = await this.getPaymentSettings();
    const { receiptPaperFormat, ...rest } = full;
    void receiptPaperFormat;
    return rest as ClientCheckoutPaymentSettings;
  }

  /** Linhas padronizadas (NIF, morada, contacto) para documentos do sistema. */
  buildDocumentIdentityLines(profile: BusinessProfileSettings): string[] {
    const lines: string[] = [];
    const tax = profile.taxId?.trim();
    if (tax) lines.push(`NIF / Contribuinte: ${tax}`);
    const address = this.formatCompanyAddress(profile);
    if (address) lines.push(`Morada: ${address}`);
    const contact = this.formatCompanyContact(profile);
    if (contact) lines.push(`Contacto: ${contact}`);
    return lines;
  }

  formatCompanyAddress(
    profile: Pick<
      BusinessProfileSettings,
      'addressLine1' | 'addressLine2' | 'city' | 'provinceRegion' | 'country'
    >,
  ): string {
    const cityRegion = [profile.city?.trim(), profile.provinceRegion?.trim()]
      .filter(Boolean)
      .join(', ');
    return [
      profile.addressLine1?.trim(),
      profile.addressLine2?.trim(),
      cityRegion || null,
      profile.country?.trim(),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  formatCompanyContact(
    profile: Pick<BusinessProfileSettings, 'phone' | 'email' | 'website'>,
  ): string {
    const parts: string[] = [];
    const phone = profile.phone?.trim();
    const email = profile.email?.trim();
    const web = profile.website?.trim();
    if (phone) parts.push(phone.startsWith('+') ? phone : `Tel: ${phone}`);
    if (email) parts.push(email);
    if (web) parts.push(web);
    return parts.join(' · ');
  }

  profileToDocumentBranding(
    profile: BusinessProfileSettings,
  ): DocumentBranding {
    const displayName =
      profile.companyName?.trim() || DEFAULT_COMPANY_NAME;
    return {
      displayName,
      legalName: profile.legalName?.trim() ?? '',
      tagline: profile.tagline?.trim() ?? '',
      logoUrl: profile.logoUrl?.trim() ?? '',
      taxId: profile.taxId?.trim() ?? '',
      address: this.formatCompanyAddress(profile),
      phone: profile.phone?.trim() ?? '',
      email: profile.email?.trim() ?? '',
      website: profile.website?.trim() ?? '',
      identityLines: this.buildDocumentIdentityLines(profile),
      agtCertificationLine: profile.agtCertificationLine?.trim() ?? '',
    };
  }

  async getDocumentBranding(): Promise<DocumentBranding> {
    const profile = await this.getBusinessProfile();
    return this.profileToDocumentBranding(profile);
  }

  /** Prefixo CSV com identificação da empresa. */
  buildDocumentCsvHeaderRows(
    branding: DocumentBranding,
    reportTitle?: string,
  ): string[] {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      `${esc('Empresa')};${esc(branding.displayName)}`,
      `${esc('NIF')};${esc(branding.taxId)}`,
      `${esc('Morada')};${esc(branding.address)}`,
      `${esc('Contacto')};${esc(this.formatCompanyContact(branding))}`,
    ];
    if (reportTitle) {
      rows.push(`${esc('Documento')};${esc(reportTitle)}`);
    }
    if (branding.agtCertificationLine?.trim()) {
      rows.push(`${esc('Licença AGT')};${esc(branding.agtCertificationLine.trim())}`);
    }
    rows.push('');
    return rows;
  }

  /** Linhas de identificação da loja antes dos dados de pagamento no comprovante. */
  buildReceiptBusinessLines(profile: BusinessProfileSettings): string[] {
    const lines: string[] = [];
    const name = profile.companyName?.trim();
    if (name) lines.push(name);
    const legal = profile.legalName?.trim();
    if (legal && legal !== name) lines.push(legal);
    const tag = profile.tagline?.trim();
    if (tag) lines.push(tag);
    lines.push(...this.buildDocumentIdentityLines(profile));
    const hours = profile.businessHours?.trim();
    if (hours) {
      lines.push(
        ...hours
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      );
    }
    return lines;
  }

  /** IBAN / titular; `establishmentName` prefixa a linha (ex.: nome comercial). */
  buildReceiptFooterLinesFromSettings(
    s: PaymentSettings,
    establishmentName?: string,
  ): string[] {
    const lines: string[] = [];
    const wa = s.whatsappNumber?.trim();
    if (wa) {
      lines.push(`WhatsApp: ${wa}`);
    }
    const bt = s.bankTransferSame;
    const bank = bt?.bankName?.trim();
    const iban = bt?.accountNumber?.trim();
    const titular = bt?.accountName?.trim();
    if (bank || iban || titular) {
      const parts: string[] = [];
      if (titular) parts.push(titular);
      if (bank) parts.push(bank);
      if (iban) parts.push(`Conta / IBAN: ${iban}`);
      const prefix = establishmentName?.trim() || 'Dádiva Go';
      lines.push(`${prefix} — ${parts.join(' · ')}`);
    }
    return lines;
  }

  async getReceiptFooterLines(): Promise<string[]> {
    const [biz, pay] = await Promise.all([
      this.getBusinessProfile(),
      this.getPaymentSettings(),
    ]);
    const head = this.buildReceiptBusinessLines(biz);
    const trade = biz.companyName?.trim();
    const tail = this.buildReceiptFooterLinesFromSettings(pay, trade);
    if (head.length && tail.length) return [...head, '—', ...tail];
    return [...head, ...tail];
  }

  async getBusinessProfile(): Promise<BusinessProfileSettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: BUSINESS_KEY },
    });
    const raw =
      (row?.value as unknown as Partial<BusinessProfileSettings>) ?? {};
    const merged: BusinessProfileSettings = { ...DEFAULT_BUSINESS };
    for (const k of BUSINESS_FIELDS) {
      const rv = raw[k];
      merged[k] = typeof rv === 'string' ? rv : DEFAULT_BUSINESS[k];
    }
    return merged;
  }

  async updateBusinessProfile(
    data: Partial<BusinessProfileSettings>,
  ): Promise<BusinessProfileSettings> {
    const current = await this.getBusinessProfile();
    if (
      typeof data.logoUrl === 'string' &&
      data.logoUrl.trim() !== current.logoUrl.trim()
    ) {
      await this.maybeUnlinkStoredLogoFile(current.logoUrl);
    }
    const merged = mergeBusinessProfile(current, data);
    await this.prisma.setting.upsert({
      where: { key: BUSINESS_KEY },
      create: { key: BUSINESS_KEY, value: merged as object },
      update: { value: merged as object },
    });
    return merged;
  }

  async getPaymentSettings(): Promise<PaymentSettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: PAYMENT_KEY },
    });
    const raw = (row?.value as unknown as Partial<PaymentSettings>) ?? {};
    return {
      bankTransferSame: {
        ...DEFAULT_PAYMENT.bankTransferSame,
        ...(raw.bankTransferSame ?? {}),
        enabled: raw.bankTransferSame?.enabled ?? true,
      },
      deposit: {
        ...DEFAULT_PAYMENT.deposit,
        ...(raw.deposit ?? {}),
        enabled: raw.deposit?.enabled ?? true,
      },
      bankTransferExpress: {
        ...DEFAULT_PAYMENT.bankTransferExpress,
        ...(raw.bankTransferExpress ?? {}),
        enabled: raw.bankTransferExpress?.enabled ?? true,
      },
      whatsappNumber: raw.whatsappNumber ?? DEFAULT_PAYMENT.whatsappNumber,
      receiptPaperFormat:
        raw.receiptPaperFormat === 'A4' ||
        raw.receiptPaperFormat === 'A4_BW' ||
        raw.receiptPaperFormat === 'A5_BW' ||
        raw.receiptPaperFormat === 'THERMAL_80' ||
        raw.receiptPaperFormat === 'THERMAL_58_BW'
          ? raw.receiptPaperFormat
          : DEFAULT_PAYMENT.receiptPaperFormat,
    };
  }

  async updatePaymentSettings(
    data: Partial<PaymentSettings>,
  ): Promise<PaymentSettings> {
    const current = await this.getPaymentSettings();
    const merged: PaymentSettings = {
      bankTransferSame: {
        ...current.bankTransferSame,
        ...(data.bankTransferSame ?? {}),
      },
      deposit: { ...current.deposit, ...(data.deposit ?? {}) },
      bankTransferExpress: {
        ...current.bankTransferExpress,
        ...(data.bankTransferExpress ?? {}),
      },
      whatsappNumber: data.whatsappNumber ?? current.whatsappNumber,
      receiptPaperFormat:
        data.receiptPaperFormat === 'A4' ||
        data.receiptPaperFormat === 'A4_BW' ||
        data.receiptPaperFormat === 'A5_BW' ||
        data.receiptPaperFormat === 'THERMAL_80' ||
        data.receiptPaperFormat === 'THERMAL_58_BW'
          ? data.receiptPaperFormat
          : current.receiptPaperFormat,
    };
    await this.prisma.setting.upsert({
      where: { key: PAYMENT_KEY },
      create: { key: PAYMENT_KEY, value: merged as object },
      update: { value: merged as object },
    });
    return merged;
  }

  private async getSmtpSettingsRaw(): Promise<SmtpMailSettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: SMTP_MAIL_KEY },
    });
    const raw = (row?.value as unknown as Partial<SmtpMailSettings>) ?? {};
    return {
      enabled: Boolean(raw.enabled),
      host:
        typeof raw.host === 'string' && raw.host.trim()
          ? raw.host.trim()
          : DEFAULT_SMTP_MAIL.host,
      port:
        typeof raw.port === 'number' && raw.port > 0
          ? raw.port
          : DEFAULT_SMTP_MAIL.port,
      secure: Boolean(raw.secure),
      requireTls:
        raw.requireTls === undefined
          ? DEFAULT_SMTP_MAIL.requireTls
          : Boolean(raw.requireTls),
      user: typeof raw.user === 'string' ? raw.user.trim() : '',
      pass: typeof raw.pass === 'string' ? raw.pass : '',
      from: typeof raw.from === 'string' ? raw.from.trim() : '',
      appName:
        typeof raw.appName === 'string' && raw.appName.trim()
          ? raw.appName.trim()
          : DEFAULT_SMTP_MAIL.appName,
    };
  }

  async getSmtpMailSettings(): Promise<SmtpMailSettingsPublic> {
    const raw = await this.getSmtpSettingsRaw();
    const { pass, ...rest } = raw;
    return { ...rest, hasPassword: Boolean(pass.trim()) };
  }

  /** Usado pelo serviço de email quando `enabled` na base de dados. */
  async getSmtpSettingsForMail(): Promise<{
    host: string;
    port: string;
    secure: string;
    requireTls: string;
    user: string;
    pass: string;
    from: string;
    appName: string;
  } | null> {
    const raw = await this.getSmtpSettingsRaw();
    if (!raw.enabled || !raw.user.trim() || !raw.pass.trim()) {
      return null;
    }
    return {
      host: raw.host,
      port: String(raw.port),
      secure: raw.secure ? 'true' : 'false',
      requireTls: raw.requireTls ? 'true' : 'false',
      user: raw.user.trim(),
      pass: raw.pass,
      from: raw.from,
      appName: raw.appName,
    };
  }

  async updateSmtpMailSettings(
    data: SmtpMailSettingsUpdate,
  ): Promise<SmtpMailSettingsPublic> {
    const current = await this.getSmtpSettingsRaw();
    const pass =
      typeof data.pass === 'string' && data.pass.trim()
        ? data.pass.trim()
        : current.pass;
    const merged: SmtpMailSettings = {
      enabled: data.enabled ?? current.enabled,
      host:
        data.host !== undefined
          ? data.host.trim() || DEFAULT_SMTP_MAIL.host
          : current.host,
      port:
        typeof data.port === 'number' && data.port > 0
          ? data.port
          : current.port,
      secure: data.secure ?? current.secure,
      requireTls: data.requireTls ?? current.requireTls,
      user: data.user !== undefined ? data.user.trim() : current.user,
      pass,
      from: data.from !== undefined ? data.from.trim() : current.from,
      appName:
        data.appName !== undefined
          ? data.appName.trim() || DEFAULT_SMTP_MAIL.appName
          : current.appName,
    };
    await this.prisma.setting.upsert({
      where: { key: SMTP_MAIL_KEY },
      create: { key: SMTP_MAIL_KEY, value: merged as object },
      update: { value: merged as object },
    });
    const { pass: _p, ...rest } = merged;
    return { ...rest, hasPassword: Boolean(merged.pass.trim()) };
  }

  // ── Twilio SMS (configurável pelo admin — substitui .env quando activo) ──

  private async getTwilioSmsSettingsRaw(): Promise<TwilioSmsSettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: TWILIO_SMS_KEY },
    });
    const raw = (row?.value as unknown as Partial<TwilioSmsSettings>) ?? {};
    return {
      enabled: Boolean(raw.enabled),
      accountSid:
        typeof raw.accountSid === 'string' ? raw.accountSid.trim() : '',
      authToken: typeof raw.authToken === 'string' ? raw.authToken : '',
      smsFrom:
        typeof raw.smsFrom === 'string' && raw.smsFrom.trim()
          ? raw.smsFrom.trim()
          : DEFAULT_TWILIO_SMS.smsFrom,
      messageTemplate:
        typeof raw.messageTemplate === 'string' && raw.messageTemplate.trim()
          ? raw.messageTemplate.trim()
          : DEFAULT_TWILIO_SMS.messageTemplate,
      oneWayFooter:
        typeof raw.oneWayFooter === 'string'
          ? raw.oneWayFooter
          : DEFAULT_TWILIO_SMS.oneWayFooter,
    };
  }

  async getTwilioSmsSettingsPublic(): Promise<TwilioSmsSettingsPublic> {
    try {
      const raw = await this.getTwilioSmsSettingsRaw();
      const envSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
      const envToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
      const envFrom = process.env.TWILIO_SMS_FROM?.trim() ?? '';
      const envConfigured = Boolean(envSid && envToken && envFrom);
      const envFlag = (
        process.env.TWILIO_SMS_ENABLED ??
        this.config.get<string>('twilio.enabled') ??
        'true'
      )
        .trim()
        .toLowerCase();
      const envEnabled =
        envFlag !== '0' && envFlag !== 'false' && envFlag !== 'off';

      const hasDbCreds = Boolean(
        raw.accountSid.trim() && raw.authToken.trim(),
      );
      const usingDb = raw.enabled && hasDbCreds;

      return {
        enabled: usingDb ? true : envConfigured && envEnabled,
        accountSid: usingDb
          ? raw.accountSid
          : raw.accountSid.trim() || envSid,
        smsFrom: usingDb
          ? raw.smsFrom
          : raw.smsFrom.trim() || envFrom || DEFAULT_TWILIO_SMS.smsFrom,
        messageTemplate: raw.messageTemplate,
        oneWayFooter: raw.oneWayFooter,
        hasAuthToken: usingDb
          ? Boolean(raw.authToken.trim())
          : Boolean(envToken || raw.authToken.trim()),
        configSource: usingDb
          ? 'database'
          : envConfigured
            ? 'env'
            : 'database',
      };
    } catch (err) {
      this.logger.error(
        `Falha ao ler configuração Twilio SMS: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        enabled: false,
        accountSid: '',
        smsFrom: DEFAULT_TWILIO_SMS.smsFrom,
        messageTemplate: DEFAULT_TWILIO_SMS.messageTemplate,
        oneWayFooter: DEFAULT_TWILIO_SMS.oneWayFooter,
        hasAuthToken: false,
        configSource: 'database',
      };
    }
  }

  async updateTwilioSmsSettings(
    data: TwilioSmsSettingsUpdate,
  ): Promise<TwilioSmsSettingsPublic> {
    const current = await this.getTwilioSmsSettingsRaw();
    const authToken =
      typeof data.authToken === 'string' && data.authToken.trim()
        ? data.authToken.trim()
        : current.authToken;
    const merged: TwilioSmsSettings = {
      enabled: data.enabled ?? current.enabled,
      accountSid:
        data.accountSid !== undefined
          ? data.accountSid.trim()
          : current.accountSid,
      authToken,
      smsFrom:
        data.smsFrom !== undefined
          ? data.smsFrom.trim() || DEFAULT_TWILIO_SMS.smsFrom
          : current.smsFrom,
      messageTemplate:
        data.messageTemplate !== undefined
          ? data.messageTemplate.trim() || DEFAULT_TWILIO_SMS.messageTemplate
          : current.messageTemplate,
      oneWayFooter:
        data.oneWayFooter !== undefined
          ? data.oneWayFooter
          : current.oneWayFooter,
    };
    await this.prisma.setting.upsert({
      where: { key: TWILIO_SMS_KEY },
      create: { key: TWILIO_SMS_KEY, value: merged as object },
      update: { value: merged as object },
    });
    const { authToken: _t, ...rest } = merged;
    return {
      ...rest,
      hasAuthToken: Boolean(merged.authToken.trim()),
      configSource: merged.enabled && merged.accountSid.trim() && merged.authToken.trim()
        ? 'database'
        : this.envTwilioConfigured()
          ? 'env'
          : 'database',
    };
  }

  /** Credenciais efectivas: base de dados (se activa) ou variáveis de ambiente. */
  async resolveTwilioSmsRuntimeConfig(): Promise<TwilioSmsRuntimeConfig | null> {
    const db = await this.getTwilioSmsSettingsRaw();
    if (
      db.enabled &&
      db.accountSid.trim() &&
      db.authToken.trim() &&
      db.smsFrom.trim()
    ) {
      return {
        enabled: true,
        accountSid: db.accountSid.trim(),
        authToken: db.authToken.trim(),
        smsFrom: db.smsFrom.trim(),
        messageTemplate: db.messageTemplate,
        oneWayFooter: db.oneWayFooter,
        source: 'database',
      };
    }

    const accountSid =
      process.env.TWILIO_ACCOUNT_SID?.trim() ??
      this.config.get<string>('twilio.accountSid')?.trim() ??
      '';
    const authToken =
      process.env.TWILIO_AUTH_TOKEN?.trim() ??
      this.config.get<string>('twilio.authToken')?.trim() ??
      '';
    const smsFrom =
      process.env.TWILIO_SMS_FROM?.trim() ??
      this.config.get<string>('twilio.smsFrom')?.trim() ??
      DEFAULT_TWILIO_SMS.smsFrom;
    const flag =
      process.env.TWILIO_SMS_ENABLED?.trim().toLowerCase() ??
      this.config.get<string>('twilio.enabled')?.trim().toLowerCase() ??
      'true';
    const enabled = flag !== '0' && flag !== 'false' && flag !== 'off';

    if (!enabled || !accountSid || !authToken || !smsFrom) {
      return null;
    }

    return {
      enabled: true,
      accountSid,
      authToken,
      smsFrom,
      messageTemplate: db.messageTemplate || DEFAULT_TWILIO_SMS.messageTemplate,
      oneWayFooter: db.oneWayFooter ?? DEFAULT_TWILIO_SMS.oneWayFooter,
      source: 'env',
    };
  }

  private envTwilioConfigured(): boolean {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
    const smsFrom = process.env.TWILIO_SMS_FROM?.trim() ?? '';
    return Boolean(accountSid && authToken && smsFrom);
  }

  private clampOverlayOpacity(value: unknown): number {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? parseInt(value, 10)
          : NaN;
    if (!Number.isFinite(n)) return DEFAULT_LOGIN_OVERLAY;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  /** Aceita só URLs geradas pelo upload interno (`/api/settings/branding/…`). */
  sanitizeStoredBackgroundUrl(url: unknown): string {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed.startsWith(BUSINESS_LOGO_URL_PREFIX)) return '';
    return this.logoKeyToStoredFilename(trimmed) ? trimmed : '';
  }

  private mergeLoginAppearance(
    raw: Partial<LoginAppearanceSettings> | null | undefined,
  ): LoginAppearanceSettings {
    const backgroundUrl = this.sanitizeStoredBackgroundUrl(raw?.backgroundUrl);
    const overlayOpacity = this.clampOverlayOpacity(raw?.overlayOpacity);
    const updatedAt =
      typeof raw?.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt.trim()
        : '';
    return { backgroundUrl, overlayOpacity, updatedAt };
  }

  async getLoginAppearanceSettings(): Promise<LoginAppearanceSettings> {
    const row = await this.prisma.setting.findUnique({
      where: { key: LOGIN_APPEARANCE_KEY },
    });
    const raw =
      (row?.value as unknown as Partial<LoginAppearanceSettings>) ?? {};
    return this.mergeLoginAppearance(raw);
  }

  /** DTO público — mesmos campos, URLs já filtradas. */
  async getPublicLoginBranding(): Promise<LoginBrandingPublic> {
    return this.getLoginAppearanceSettings();
  }

  async updateLoginAppearanceSettings(
    data: LoginAppearanceUpdate,
  ): Promise<LoginAppearanceSettings> {
    if (data.overlayOpacity === undefined) {
      return this.getLoginAppearanceSettings();
    }
    const current = await this.getLoginAppearanceSettings();
    const merged: LoginAppearanceSettings = {
      ...current,
      overlayOpacity: this.clampOverlayOpacity(data.overlayOpacity),
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.setting.upsert({
      where: { key: LOGIN_APPEARANCE_KEY },
      create: { key: LOGIN_APPEARANCE_KEY, value: merged as object },
      update: { value: merged as object },
    });
    return merged;
  }

  private assertRasterImageMagic(buffer: Buffer, mime: string): void {
    if (mime === 'image/png') {
      if (buffer[0] === 0x89 && buffer[1] === 0x50) return;
    } else if (mime === 'image/jpeg') {
      if (buffer[0] === 0xff && buffer[1] === 0xd8) return;
    } else if (mime === 'image/webp') {
      if (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      ) {
        return;
      }
    }
    throw new BadRequestException(
      'Conteúdo do ficheiro não corresponde a uma imagem PNG, JPEG ou WEBP válida.',
    );
  }

  /** Grava fundo de login (PNG/JPEG/WebP) e persiste URL interna. */
  async uploadAndPersistLoginBackground(
    file: MemoryUploadedLogo,
  ): Promise<LoginAppearanceSettings> {
    if (!file.buffer?.length) {
      throw new BadRequestException('Envia uma imagem no campo file.');
    }
    if (!this.loginBackgroundAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo não permitido — usa PNG, JPEG ou WEBP.',
      );
    }
    if (file.size > this.maxLoginBackgroundBytes) {
      throw new BadRequestException('Imagem demasiado grande — máximo 5 MB.');
    }
    this.assertRasterImageMagic(file.buffer, file.mimetype);

    let ext = extname(file.originalname).toLowerCase();
    ext =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9]+$/.test(ext)
        ? ext
        : this.extForLogoMime(file.mimetype);
    if (ext === '.svg') ext = this.extForLogoMime(file.mimetype);

    const storageKey = `${randomUUID()}${ext}`;
    const dir = this.logoDirAbsolute();
    await mkdir(dir, { recursive: true });

    const current = await this.getLoginAppearanceSettings();
    await this.maybeUnlinkStoredLogoFile(current.backgroundUrl);

    await writeFile(join(dir, storageKey), file.buffer);

    const backgroundUrl = `${BUSINESS_LOGO_URL_PREFIX}${storageKey}`;
    const merged: LoginAppearanceSettings = {
      backgroundUrl,
      overlayOpacity: current.overlayOpacity,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.setting.upsert({
      where: { key: LOGIN_APPEARANCE_KEY },
      create: { key: LOGIN_APPEARANCE_KEY, value: merged as object },
      update: { value: merged as object },
    });
    return merged;
  }

  /** Remove fundo personalizado e repõe a imagem predefinida do site. */
  async resetLoginBackground(): Promise<LoginAppearanceSettings> {
    const current = await this.getLoginAppearanceSettings();
    await this.maybeUnlinkStoredLogoFile(current.backgroundUrl);
    const merged: LoginAppearanceSettings = {
      backgroundUrl: '',
      overlayOpacity: current.overlayOpacity,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.setting.upsert({
      where: { key: LOGIN_APPEARANCE_KEY },
      create: { key: LOGIN_APPEARANCE_KEY, value: merged as object },
      update: { value: merged as object },
    });
    return merged;
  }
}
