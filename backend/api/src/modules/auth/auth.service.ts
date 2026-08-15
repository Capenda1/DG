import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, ClientType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { normalizeEmail } from '../../common/email.util';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import type { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import type { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterClientDto } from './dto/register-client.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import type { JwtPayload } from './types/jwt-payload.type';
import {
  buildOtpAuthUrl,
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from './mfa.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashPasswordResetToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateResetCode(): string {
    return String(randomInt(100000, 1000000));
  }

  private isAdminRole(role: UserRole) {
    return role === UserRole.ADMIN;
  }

  private async createRefreshSession(
    userId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const days = this.config.get<number>('jwt.refreshExpiresDays') ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        ip,
        userAgent,
      },
    });
    return refreshToken;
  }

  private signAccess(user: { id: string; email: string; role: UserRole }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwt.sign(payload);
  }

  /**
   * Primeiro administrador quando a base está vazia.
   * Em produção exige `BOOTSTRAP_ADMIN_SECRET` e cabeçalho `x-bootstrap-token`.
   */
  async bootstrapAdmin(
    dto: BootstrapAdminDto,
    bootstrapToken: string | undefined,
    ip?: string,
    userAgent?: string,
  ) {
    const count = await this.prisma.user.count();
    if (count > 0) {
      throw new ConflictException(
        'Já existem utilizadores. Utilize login ou peça a um administrador.',
      );
    }
    const secret =
      this.config.get<string>('bootstrapAdminSecret')?.trim() ?? '';
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !secret) {
      throw new UnauthorizedException(
        'Defina BOOTSTRAP_ADMIN_SECRET no ambiente antes do primeiro arranque.',
      );
    }
    if (secret && bootstrapToken !== secret) {
      throw new UnauthorizedException('Token de arranque inválido.');
    }

    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Este Email já está registado.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      email: normalizeEmail(dto.email),
      name: dto.name,
      passwordHash,
      role: UserRole.ADMIN,
      phone: undefined,
    });
    const accessToken = this.signAccess({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = await this.createRefreshSession(
      user.id,
      ip,
      userAgent,
    );
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.CREATE,
        userId: user.id,
        payload: { bootstrap: true, ip, userAgent },
      },
    });
    return { user, accessToken, refreshToken };
  }

  /**
   * Criação de utilizadores apenas por administrador autenticado (sem sessão do novo utilizador).
   */
  async createUserByAdmin(
    dto: CreateUserDto,
    actorAdminId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const isCollaborator = dto.role === UserRole.COLLABORATOR;
    const isClient = dto.role === UserRole.CLIENT;
    const email = isClient
      ? `cliente.${randomBytes(8).toString('hex')}@cliente.local`
      : isCollaborator
        ? dto.email?.trim()
          ? await this.users.assertEmailAvailable(dto.email)
          : `colab.${randomBytes(8).toString('hex')}@interno.local`
        : await this.users.assertEmailAvailable(dto.email!);
    const phone = isClient
      ? await this.users.assertClientPhoneAvailable(dto.phone ?? '')
      : dto.phone;
    const clientType = isClient
      ? dto.isCompany
        ? ClientType.COMPANY
        : ClientType.INDIVIDUAL
      : null;
    const nif =
      isClient && dto.isCompany ? (dto.nif?.trim() ?? null) : null;

    const plainPassword = isCollaborator
      ? randomBytes(24).toString('base64url')
      : dto.password!;
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const user = await this.users.create({
      email,
      name: dto.name,
      passwordHash,
      role: dto.role,
      phone,
      clientType,
      nif,
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.CREATE,
        userId: actorAdminId,
        payload: {
          createdRole: dto.role,
          ...(isClient ? { clientType } : {}),
          ip,
          userAgent,
        },
      },
    });
    return { user };
  }

  /**
   * Auto-cadastro público: cria exclusivamente contas de cliente e inicia
   * imediatamente uma sessão. O papel e o email interno nunca vêm do pedido.
   */
  async registerClient(
    dto: RegisterClientDto,
    ip?: string,
    userAgent?: string,
  ) {
    const phone = await this.users.assertClientPhoneAvailable(dto.phone);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      email: `cliente.${randomBytes(16).toString('hex')}@cliente.local`,
      name: dto.name.trim(),
      passwordHash,
      role: UserRole.CLIENT,
      phone,
      clientType: dto.isCompany ? ClientType.COMPANY : ClientType.INDIVIDUAL,
      nif: dto.isCompany ? dto.nif?.trim() : null,
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.CREATE,
        userId: user.id,
        payload: {
          selfRegistration: true,
          clientType: dto.isCompany ? ClientType.COMPANY : ClientType.INDIVIDUAL,
          ip,
          userAgent,
        },
      },
    });

    return this.issueSessionAfterAuth(user, ip, userAgent);
  }

  async updateUserByAdmin(
    targetId: string,
    dto: AdminUpdateUserDto,
    actorAdminId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const hasUpdate =
      dto.email !== undefined ||
      dto.name !== undefined ||
      dto.role !== undefined ||
      dto.phone !== undefined ||
      dto.isCompany !== undefined ||
      dto.nif !== undefined ||
      dto.active !== undefined;
    if (!hasUpdate) {
      throw new BadRequestException('Nenhum campo para atualizar.');
    }

    const current = await this.users.findById(targetId);
    if (!current) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    if (
      dto.role !== undefined &&
      current.role === UserRole.ADMIN &&
      dto.role !== UserRole.ADMIN
    ) {
      const admins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (admins <= 1) {
        throw new ConflictException(
          'Não pode retirar o perfil de administrador ao último administrador.',
        );
      }
    }

    if (dto.email !== undefined) {
      await this.users.assertEmailAvailable(dto.email, targetId);
    }

    const data: {
      email?: string;
      name?: string;
      role?: UserRole;
      phone?: string | null;
      clientType?: ClientType | null;
      nif?: string | null;
      active?: boolean;
    } = {};
    if (dto.email !== undefined) {
      data.email = normalizeEmail(dto.email);
    }
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
    }
    const resultingRole = dto.role ?? current.role;
    if (
      resultingRole === UserRole.CLIENT &&
      (dto.phone !== undefined || dto.role === UserRole.CLIENT)
    ) {
      data.phone = await this.users.assertClientPhoneAvailable(
        dto.phone ?? current.phone ?? '',
        targetId,
      );
    } else if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() ? dto.phone.trim() : null;
    }

    if (resultingRole === UserRole.CLIENT) {
      if (dto.isCompany !== undefined) {
        data.clientType = dto.isCompany
          ? ClientType.COMPANY
          : ClientType.INDIVIDUAL;
        if (!dto.isCompany) {
          data.nif = null;
        }
      }
      const willBeCompany =
        dto.isCompany === true ||
        (dto.isCompany === undefined &&
          current.clientType === ClientType.COMPANY);
      if (willBeCompany) {
        const nextNif =
          dto.nif !== undefined ? dto.nif.trim() : (current.nif ?? '');
        if (!nextNif) {
          throw new BadRequestException(
            'O NIF é obrigatório para contas de empresa.',
          );
        }
        if (dto.nif !== undefined || dto.isCompany === true) {
          data.nif = nextNif;
        }
      }
      if (dto.active !== undefined) {
        data.active = dto.active;
      }
    } else if (
      dto.role !== undefined ||
      dto.isCompany !== undefined ||
      dto.nif !== undefined
    ) {
      data.clientType = null;
      data.nif = null;
    }

    if (dto.active !== undefined && resultingRole !== UserRole.CLIENT) {
      throw new BadRequestException(
        'A activação/desactivação aplica-se apenas a contas de cliente.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: targetId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        phone: true,
        clientType: true,
        nif: true,
        active: true,
        createdAt: true,
      },
    });

    if (dto.active === false && resultingRole === UserRole.CLIENT) {
      await this.prisma.userSession.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: user.id,
        action: AuditAction.UPDATE,
        userId: actorAdminId,
        payload: { fields: Object.keys(data), ip, userAgent },
      },
    });

    return { user };
  }

  async resetUserPasswordByAdmin(
    targetId: string,
    newPassword: string,
    actorAdminId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const exists = await this.users.findById(targetId);
    if (!exists) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    if (exists.role === UserRole.COLLABORATOR) {
      throw new BadRequestException(
        'Colaboradores sem acesso ao sistema não utilizam palavra-passe. Altere o perfil para Atendente, Designer ou Admin se precisar de login.',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { passwordHash },
    });
    await this.prisma.userSession.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: targetId,
        action: AuditAction.UPDATE,
        userId: actorAdminId,
        payload: { passwordResetByAdmin: true, ip, userAgent },
      },
    });
  }

  async deleteUserByAdmin(
    targetId: string,
    actorAdminId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.users.assertDeletableOrThrow(targetId, actorAdminId);
    await this.users.deleteHard(targetId);
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: targetId,
        action: AuditAction.DELETE,
        userId: actorAdminId,
        payload: { ip, userAgent },
      },
    });
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const email = dto.email?.trim();
    const phone = dto.phone?.trim();
    if ((!email && !phone) || (email && phone)) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const full = email
      ? await this.users.findByEmail(normalizeEmail(email))
      : await this.users.findClientByPhone(phone!);
    if (!full) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    /* Clientes entram exclusivamente por telefone; email é reservado ao staff. */
    if (email && full.role === UserRole.CLIENT) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (full.role === UserRole.COLLABORATOR) {
      throw new UnauthorizedException(
        'Esta conta é apenas para registo interno (RH). Não tem acesso ao sistema.',
      );
    }
    if (full.active === false) {
      throw new UnauthorizedException(
        'Esta conta está desactivada. Contacte a Dádiva para reactivar o acesso.',
      );
    }
    const ok = await bcrypt.compare(dto.password, full.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (full.mfaEnabled && full.mfaSecretEnc) {
      const mfaToken = this.signMfaPending(full.id);
      return {
        mfaRequired: true as const,
        mfaToken,
      };
    }

    return this.issueSessionAfterAuth(full, ip, dto.userAgent ?? userAgent);
  }

  /** Confirma MFA após password correcta (código TOTP ou recuperação). */
  async verifyMfaLogin(
    mfaToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const userId = this.verifyMfaPendingToken(mfaToken);
    const full = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!full || !full.mfaEnabled || !full.mfaSecretEnc) {
      throw new UnauthorizedException('Desafio MFA inválido.');
    }

    const jwtSecret = this.requireJwtSecret();
    const secret = decryptMfaSecret(full.mfaSecretEnc, jwtSecret);
    const trimmed = code.replace(/\s+/g, '').trim();

    let accepted = verifyTotpCode(secret, trimmed);
    if (!accepted && trimmed.length >= 8) {
      accepted = await this.consumeRecoveryCode(full.id, trimmed);
    }
    if (!accepted) {
      throw new UnauthorizedException('Código MFA inválido.');
    }

    return this.issueSessionAfterAuth(full, ip, userAgent);
  }

  /** Inicia configuração MFA (ADMIN) — devolve secret + otpauth URL. */
  async beginMfaSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    if (user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException(
        'Apenas administradores podem activar MFA.',
      );
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA já está activo nesta conta.');
    }

    const secret = generateTotpSecret();
    const jwtSecret = this.requireJwtSecret();
    const enc = encryptMfaSecret(secret, jwtSecret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: enc, mfaEnabled: false, mfaRecoveryHashes: null },
    });

    return {
      secret,
      otpauthUrl: buildOtpAuthUrl({ secret, email: user.email }),
    };
  }

  /** Confirma o primeiro código TOTP e activa MFA + códigos de recuperação. */
  async confirmMfaSetup(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    if (user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException(
        'Apenas administradores podem activar MFA.',
      );
    }
    if (!user.mfaSecretEnc) {
      throw new BadRequestException('Inicie a configuração MFA primeiro.');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA já está activo.');
    }

    const jwtSecret = this.requireJwtSecret();
    const secret = decryptMfaSecret(user.mfaSecretEnc, jwtSecret);
    if (!verifyTotpCode(secret, code)) {
      throw new BadRequestException('Código inválido. Tente novamente.');
    }

    const recoveryCodes = generateRecoveryCodes(8);
    const hashes = await Promise.all(
      recoveryCodes.map((c) => bcrypt.hash(c, 10)),
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryHashes: JSON.stringify(hashes),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: userId,
        action: AuditAction.UPDATE,
        userId,
        payload: { mfaEnabled: true },
      },
    });

    return { recoveryCodes };
  }

  async disableMfa(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado.');
    if (!user.mfaEnabled || !user.mfaSecretEnc) {
      throw new BadRequestException('MFA não está activo.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Palavra-passe incorrecta.');

    const jwtSecret = this.requireJwtSecret();
    const secret = decryptMfaSecret(user.mfaSecretEnc, jwtSecret);
    const trimmed = code.replace(/\s+/g, '').trim();
    let accepted = verifyTotpCode(secret, trimmed);
    if (!accepted && trimmed.length >= 8) {
      accepted = await this.consumeRecoveryCode(userId, trimmed);
    }
    if (!accepted) {
      throw new UnauthorizedException('Código MFA inválido.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaRecoveryHashes: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: userId,
        action: AuditAction.UPDATE,
        userId,
        payload: { mfaEnabled: false },
      },
    });
    return { message: 'MFA desactivado.' };
  }

  private async issueSessionAfterAuth(
    full: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      mfaEnabled: boolean;
      phone: string | null;
      clientType?: ClientType | null;
      nif?: string | null;
      active?: boolean;
      createdAt: Date;
    },
    ip?: string,
    userAgent?: string,
  ) {
    if (full.active === false) {
      throw new UnauthorizedException(
        'Esta conta está desactivada. Contacte a Dádiva para reactivar o acesso.',
      );
    }
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: full.id,
        action: AuditAction.LOGIN,
        userId: full.id,
        payload: { ip, userAgent },
      },
    });
    const accessToken = this.signAccess({
      id: full.id,
      email: full.email,
      role: full.role,
    });
    const refreshToken = await this.createRefreshSession(
      full.id,
      ip,
      userAgent,
    );
    return {
      mfaRequired: false as const,
      user: {
        id: full.id,
        email: full.email,
        name: full.name,
        role: full.role,
        mfaEnabled: full.mfaEnabled,
        phone: full.phone,
        clientType: full.clientType ?? null,
        nif: full.nif ?? null,
        active: full.active ?? true,
        createdAt: full.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  private requireJwtSecret(): string {
    const secret = this.config.get<string>('jwt.secret')?.trim();
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET não configurado.');
    }
    return secret;
  }

  private signMfaPending(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: 'mfa' },
      { expiresIn: '5m' },
    );
  }

  private verifyMfaPendingToken(token: string): string {
    try {
      const payload = this.jwt.verify<{ sub?: string; purpose?: string }>(
        token,
      );
      if (payload.purpose !== 'mfa' || !payload.sub) {
        throw new UnauthorizedException('Desafio MFA inválido.');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Desafio MFA expirado. Inicie sessão novamente.',
      );
    }
  }

  private async consumeRecoveryCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaRecoveryHashes: true },
    });
    if (!user?.mfaRecoveryHashes) return false;
    let hashes: string[];
    try {
      hashes = JSON.parse(user.mfaRecoveryHashes) as string[];
      if (!Array.isArray(hashes)) return false;
    } catch {
      return false;
    }
    for (let i = 0; i < hashes.length; i++) {
      const match = await bcrypt.compare(code.toUpperCase(), hashes[i]!);
      if (match) {
        const next = hashes.filter((_, idx) => idx !== i);
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            mfaRecoveryHashes:
              next.length > 0 ? JSON.stringify(next) : null,
          },
        });
        return true;
      }
    }
    return false;
  }

  async refresh(dto: RefreshDto) {
    const refreshTokenHash = this.hashRefreshToken(dto.refreshToken);
    const session = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });
    if (!session) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    if (session.user.active === false) {
      throw new UnauthorizedException('Conta desactivada.');
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = this.signAccess({
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });
    const refreshToken = await this.createRefreshSession(
      session.user.id,
      session.ip ?? undefined,
      session.userAgent ?? undefined,
    );
    return { accessToken, refreshToken };
  }

  /** Revoga o refresh token actual (logout). Idempotente se já revogado. */
  async logout(dto: RefreshDto) {
    const refreshTokenHash = this.hashRefreshToken(dto.refreshToken);
    await this.prisma.userSession.updateMany({
      where: {
        refreshTokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { message: 'Sessão terminada.' };
  }

  async requestStaffPasswordReset(dto: ForgotPasswordDto) {
    const genericMessage =
      'Se os dados estiverem corretos, receberá um email em breve.';
    const user = await this.users.findByEmail(dto.email);
    if (!user || !this.isAdminRole(user.role)) {
      return { message: genericMessage };
    }

    if (!(await this.mail.isConfigured())) {
      this.logger.error('Recuperação: serviço de email indisponível.');
      return { message: genericMessage };
    }

    const code = this.generateResetCode();
    const codeHash = this.hashPasswordResetToken(code);
    const expiresMinutes =
      this.config.get<number>('mail.passwordResetCodeMinutes') ?? 10;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresMinutes);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const resetRow = await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: codeHash,
        expiresAt,
      },
    });

    try {
      await this.mail.sendPasswordResetCodeEmail({
        to: user.email,
        recipientName: user.name,
        code,
      });
    } catch (err) {
      await this.prisma.passwordResetToken.update({
        where: { id: resetRow.id },
        data: { usedAt: new Date() },
      });
      this.logger.error(
        'Falha ao enviar código de recuperação.',
        err instanceof Error ? err.stack : String(err),
      );
    }

    return { message: genericMessage };
  }

  async verifyStaffPasswordResetCode(dto: VerifyResetCodeDto) {
    const invalid = () =>
      new BadRequestException('Código inválido ou expirado.');

    const user = await this.users.findByEmail(dto.email);
    if (!user || !this.isAdminRole(user.role)) {
      throw invalid();
    }

    const codeHash = this.hashPasswordResetToken(dto.code.trim());
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        tokenHash: codeHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) {
      throw invalid();
    }

    const resetToken = randomBytes(32).toString('base64url');
    const resetTokenHash = this.hashPasswordResetToken(resetToken);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    await this.prisma.passwordResetToken.update({
      where: { id: row.id },
      data: {
        tokenHash: resetTokenHash,
        expiresAt,
      },
    });

    return { resetToken };
  }

  async confirmStaffPasswordReset(
    dto: ResetPasswordDto,
    ip?: string,
    userAgent?: string,
  ) {
    const resetTokenHash = this.hashPasswordResetToken(dto.resetToken);
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: resetTokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    if (!row || !this.isAdminRole(row.user.role)) {
      throw new BadRequestException('Sessão de recuperação inválida ou expirada.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: row.userId,
        action: AuditAction.UPDATE,
        userId: row.userId,
        payload: { passwordResetSelfService: true, ip, userAgent },
      },
    });

    return { message: 'Palavra-passe atualizada.' };
  }
}
