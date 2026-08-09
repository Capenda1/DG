import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { IssueOrderDocumentDto } from './dto/issue-order-document.dto';
import { OrderDocumentsService } from './order-documents.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderDocumentsController {
  constructor(private readonly documents: OrderDocumentsService) {}

  @Post('orders/:id/documents/issue')
  @HttpCode(HttpStatus.CREATED)
  issueForOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: IssueOrderDocumentDto,
    @Req() req: Request & { user: { id: string; role: UserRole; name?: string } },
  ) {
    return this.documents.issueDocument(
      id,
      dto.documentModel,
      dto.action,
      req.user,
    );
  }
}
