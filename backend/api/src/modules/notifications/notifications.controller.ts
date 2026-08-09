import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationStatus, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  SettingsService,
  type TwilioSmsSettingsUpdate,
} from '../settings/settings.service';
import { NotificationsService } from './notifications.service';
import { TwilioSmsService } from './twilio-sms.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.ATTENDANT)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly twilio: TwilioSmsService,
    private readonly settings: SettingsService,
  ) {}

  @Get('sms/status')
  getSmsStatus() {
    return this.twilio.getStatus();
  }

  @Get('sms/settings')
  getSmsSettings(
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode ver a configuração Twilio.',
      );
    }
    return this.settings.getTwilioSmsSettingsPublic();
  }

  @Patch('sms/settings')
  updateSmsSettings(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: TwilioSmsSettingsUpdate,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas o admin pode alterar a configuração Twilio.',
      );
    }
    return this.settings.updateTwilioSmsSettings(body);
  }

  @Get('sms/history')
  listSmsHistory(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('status') status?: string,
    @Query('q') search?: string,
    @Query('orderId') orderId?: string,
  ) {
    let statusFilter: NotificationStatus | undefined;
    if (status?.trim()) {
      const s = status.trim().toUpperCase();
      if (Object.values(NotificationStatus).includes(s as NotificationStatus)) {
        statusFilter = s as NotificationStatus;
      }
    }

    return this.notifications.listSmsHistory({
      take: take ? parseInt(take, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
      status: statusFilter,
      search,
      orderId: orderId?.trim() || undefined,
    });
  }

  @Delete('sms/history/:id')
  deleteSmsHistoryItem(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Param('id') id: string,
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas o admin pode eliminar registos SMS.');
    }
    return this.notifications.deleteSmsHistory([id]);
  }

  @Delete('sms/history')
  deleteSmsHistoryBulk(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: { ids?: string[] },
  ) {
    if (req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Apenas o admin pode eliminar registos SMS.');
    }
    return this.notifications.deleteSmsHistory(body?.ids ?? []);
  }
}
