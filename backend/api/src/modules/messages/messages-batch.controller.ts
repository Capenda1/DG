import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesBatchController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('unread-counts')
  @HttpCode(HttpStatus.OK)
  unreadCounts(
    @Body('orderIds') orderIds: unknown,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    if (!Array.isArray(orderIds)) {
      throw new BadRequestException('orderIds deve ser um array.');
    }
    return this.messagesService.unreadCountsBatch(orderIds, req.user);
  }
}
