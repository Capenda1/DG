import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  SettingsService,
  type BusinessProfileSettings,
  type DocumentBranding,
  type LoginAppearanceSettings,
  type LoginAppearanceUpdate,
  type LoginBrandingPublic,
  type MemoryUploadedLogo,
  type PaymentSettings,
  type SmtpMailSettingsUpdate,
} from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Fundo e overlay do login — público (página `/login` antes de autenticação).
   */
  @Get('public/login-branding')
  getPublicLoginBranding(): Promise<LoginBrandingPublic> {
    return this.settingsService.getPublicLoginBranding();
  }

  /** Aparência do login — leitura completa, só ADMIN. */
  @UseGuards(JwtAuthGuard)
  @Get('login-appearance')
  getLoginAppearance(
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ): Promise<LoginAppearanceSettings> {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode ver a aparência do login.',
      );
    }
    return this.settingsService.getLoginAppearanceSettings();
  }

  /** Overlay do login — só ADMIN; o fundo só muda por upload ou reset. */
  @UseGuards(JwtAuthGuard)
  @Patch('login-appearance')
  updateLoginAppearance(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: LoginAppearanceUpdate,
  ): Promise<LoginAppearanceSettings> {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode alterar a aparência do login.',
      );
    }
    return this.settingsService.updateLoginAppearanceSettings(body);
  }

  /** Upload de fundo de login (PNG/JPEG/WebP) — grava disco e persiste URL interna. Só ADMIN. */
  @UseGuards(JwtAuthGuard)
  @Post('login-background')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLoginBackground(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @UploadedFile() file: MemoryUploadedLogo | undefined,
  ): Promise<LoginAppearanceSettings> {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode enviar o fundo do login.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Envia uma imagem no campo file (PNG, JPEG ou WEBP).',
      );
    }
    return this.settingsService.uploadAndPersistLoginBackground(file);
  }

  /** Repõe a imagem predefinida do site — só ADMIN. */
  @UseGuards(JwtAuthGuard)
  @Delete('login-background')
  resetLoginBackground(
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ): Promise<LoginAppearanceSettings> {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode repor o fundo do login.',
      );
    }
    return this.settingsService.resetLoginBackground();
  }

  /**
   * Definições completas (incl. formato de papel do comprovante) — apenas operação interna.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  @Get('payment')
  getPayment() {
    return this.settingsService.getPaymentSettings();
  }

  /**
   * Checkout do cliente: métodos de pagamento e WhatsApp, sem configuração interna de comprovante.
   * Leitura para qualquer utilizador autenticado na área cliente / pré-visualização (igual a `business`).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT, UserRole.DESIGNER)
  @Get('payment/client')
  getPaymentClient() {
    return this.settingsService.getClientCheckoutPaymentSettings();
  }

  /**
   * Dados públicos da empresa para cabeçalhos, contacto e facturação.
   * Leitura permitida a quem está autenticado (área cliente / operação).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  @Get('business')
  getBusinessProfile() {
    return this.settingsService.getBusinessProfile();
  }

  /**
   * Identidade institucional para cabeçalhos de PDFs, relatórios e exports.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
  @Get('document-branding')
  getDocumentBranding(): Promise<DocumentBranding> {
    return this.settingsService.getDocumentBranding();
  }

  /** Upload de logótipo (PNG/JPEG/WebP/SVG) — grava disco e persiste `logoUrl`. Só ADMIN. */
  @UseGuards(JwtAuthGuard)
  @Post('business/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  uploadBusinessLogo(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @UploadedFile() file: MemoryUploadedLogo | undefined,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode enviar o logótipo da empresa.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Envia uma imagem no campo file (PNG, JPEG, WEBP ou SVG).',
      );
    }
    return this.settingsService.uploadAndPersistBusinessLogo(file);
  }

  /** Texto de rodapé do comprovante (só emissão pela operação). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  @Get('payment/receipt-footer')
  getPaymentReceiptFooter() {
    return this.settingsService
      .getReceiptFooterLines()
      .then((lines) => ({ lines }));
  }

  /** Apenas Admin pode alterar. */
  @UseGuards(JwtAuthGuard)
  @Patch('payment')
  updatePayment(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: Partial<PaymentSettings>,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode alterar as configurações.',
      );
    }
    return this.settingsService.updatePaymentSettings(body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('business')
  updateBusiness(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: Partial<BusinessProfileSettings>,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode alterar os dados da empresa.',
      );
    }
    return this.settingsService.updateBusinessProfile(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('smtp')
  getSmtpMail(
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas o admin pode ver o SMTP.');
    }
    return this.settingsService.getSmtpMailSettings();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('smtp')
  updateSmtpMail(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: SmtpMailSettingsUpdate,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas o admin pode alterar o SMTP.');
    }
    return this.settingsService.updateSmtpMailSettings(body);
  }
}
