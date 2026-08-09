import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller('orders/:orderId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Query('since') since?: string,
  ) {
    return this.messagesService.listMessages(orderId, req.user, since);
  }

  @Post()
  send(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body('content') content: string,
  ) {
    if (!content?.trim())
      throw new BadRequestException('Mensagem não pode estar vazia.');
    return this.messagesService.sendMessage(orderId, content, req.user);
  }

  @Patch('read')
  markRead(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.messagesService.markRead(orderId, req.user);
  }

  @Get('unread-count')
  unreadCount(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.messagesService.unreadCount(orderId, req.user);
  }
}
