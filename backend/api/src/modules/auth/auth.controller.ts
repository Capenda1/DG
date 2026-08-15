import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from './types/session-user.type';
import { AuthService } from './auth.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { MfaVerifyLoginDto } from './dto/mfa-verify-login.dto';

@Controller('auth')
@Throttle({ default: { limit: 15, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria o primeiro utilizador (admin) quando não existe ninguém na base.
   * Em produção: env `BOOTSTRAP_ADMIN_SECRET` + cabeçalho `x-bootstrap-token`.
   */
  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  bootstrap(
    @Body() dto: BootstrapAdminDto,
    @Headers('x-bootstrap-token') bootstrapToken: string | undefined,
    @Req() req: Request,
  ) {
    return this.auth.bootstrapAdmin(
      dto,
      bootstrapToken,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.ip, req.get('user-agent') ?? undefined);
  }

  @Post('register/client')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerClient(@Body() dto: RegisterClientDto, @Req() req: Request) {
    return this.auth.registerClient(
      dto,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyMfa(@Body() dto: MfaVerifyLoginDto, @Req() req: Request) {
    return this.auth.verifyMfaLogin(
      dto.mfaToken,
      dto.code,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  beginMfaSetup(@Req() req: Request & { user: SessionUser }) {
    return this.auth.beginMfaSetup(req.user.id);
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  enableMfa(
    @Body() dto: MfaCodeDto,
    @Req() req: Request & { user: SessionUser },
  ) {
    return this.auth.confirmMfaSetup(req.user.id, dto.code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  disableMfa(
    @Body() dto: MfaDisableDto,
    @Req() req: Request & { user: SessionUser },
  ) {
    return this.auth.disableMfa(req.user.id, dto.password, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto);
  }

  /**
   * Devolve o perfil do utilizador autenticado.
   * O JwtStrategy já carregou o user da BD; reutilizamos req.user directamente
   * para evitar uma segunda consulta desnecessária.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: SessionUser }) {
    const requireAdminMfa = this.config.get<boolean>('mfaRequireAdmin') === true;
    const mfaSetupRequired =
      requireAdminMfa &&
      req.user.role === 'ADMIN' &&
      !req.user.mfaEnabled;
    return { ...req.user, mfaSetupRequired };
  }

  /** Recuperação admin — pedido de código. */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestStaffPasswordReset(dto);
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.auth.verifyStaffPasswordResetCode(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.confirmStaffPasswordReset(
      dto,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }
}
