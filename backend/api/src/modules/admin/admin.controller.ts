import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AdminResetPasswordDto } from '../auth/dto/admin-reset-password.dto';
import { AdminUpdateUserDto } from '../auth/dto/admin-update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { UsersService } from '../users/users.service';

type AuthedRequest = Request & {
  user: { id: string; role: UserRole };
};

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** Gerente: só contas CLIENT. Admin: equipa + clientes. */
  private assertManagerClientOnly(
    actorRole: UserRole,
    targetRole: UserRole | undefined,
    action: string,
  ): void {
    if (actorRole !== UserRole.MANAGER) return;
    if (targetRole !== UserRole.CLIENT) {
      throw new ForbiddenException(
        `O gerente só pode ${action} contas de cliente.`,
      );
    }
  }

  @Get('users')
  listUsers(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('role') roleParam?: string,
    @Query('excludeRole') excludeRoleParam?: string,
    @Query('includeOrderCount') includeOrderCount?: string,
  ) {
    let role: UserRole | undefined;
    if (roleParam != null && roleParam !== '') {
      if (!Object.values(UserRole).includes(roleParam as UserRole)) {
        throw new BadRequestException('Parâmetro role inválido.');
      }
      role = roleParam as UserRole;
    }
    let excludeRole: UserRole | undefined;
    if (excludeRoleParam != null && excludeRoleParam !== '') {
      if (!Object.values(UserRole).includes(excludeRoleParam as UserRole)) {
        throw new BadRequestException('Parâmetro excludeRole inválido.');
      }
      excludeRole = excludeRoleParam as UserRole;
    }

    if (req.user.role === UserRole.MANAGER) {
      if (role != null && role !== UserRole.CLIENT) {
        throw new ForbiddenException(
          'O gerente só pode listar contas de cliente.',
        );
      }
      role = UserRole.CLIENT;
      excludeRole = undefined;
    }

    return this.users.findManyForAdmin({
      search: q,
      role,
      excludeRole,
      includeOrderCount:
        includeOrderCount === '1' || includeOrderCount === 'true',
    });
  }

  /** Verifica se o email já existe (qualquer perfil: cliente, admin, equipa). */
  @Get('users/check-email')
  checkEmail(
    @Query('email') email?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.users.checkEmailAvailability(email ?? '', excludeId);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  createUser(@Body() dto: CreateUserDto, @Req() req: AuthedRequest) {
    this.assertManagerClientOnly(req.user.role, dto.role, 'criar');
    return this.auth.createUserByAdmin(
      dto,
      req.user.id,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AdminUpdateUserDto,
    @Req() req: AuthedRequest,
  ) {
    if (req.user.role === UserRole.MANAGER) {
      const current = await this.users.findById(id);
      if (!current) {
        throw new BadRequestException('Utilizador não encontrado.');
      }
      this.assertManagerClientOnly(req.user.role, current.role, 'alterar');
      if (dto.role !== undefined && dto.role !== UserRole.CLIENT) {
        throw new ForbiddenException(
          'O gerente não pode alterar o perfil de uma conta de cliente.',
        );
      }
    }
    return this.auth.updateUserByAdmin(
      id,
      dto,
      req.user.id,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() req: AuthedRequest,
  ) {
    if (req.user.role === UserRole.MANAGER) {
      const current = await this.users.findById(id);
      if (!current) {
        throw new BadRequestException('Utilizador não encontrado.');
      }
      this.assertManagerClientOnly(
        req.user.role,
        current.role,
        'repor a palavra-passe de',
      );
    }
    await this.auth.resetUserPasswordByAdmin(
      id,
      dto.newPassword,
      req.user.id,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: AuthedRequest,
  ) {
    if (req.user.role === UserRole.MANAGER) {
      const current = await this.users.findById(id);
      if (!current) {
        throw new BadRequestException('Utilizador não encontrado.');
      }
      this.assertManagerClientOnly(req.user.role, current.role, 'eliminar');
    }
    await this.auth.deleteUserByAdmin(
      id,
      req.user.id,
      req.ip,
      req.get('user-agent') ?? undefined,
    );
  }
}
