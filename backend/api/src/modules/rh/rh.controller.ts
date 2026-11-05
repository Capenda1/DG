import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateRhAttendanceDto,
} from './dto/create-rh-document.dto';
import {
  RhDailyPunchDto,
  UpsertRhDailyDto,
} from './dto/upsert-rh-daily.dto';
import { UpsertRhProfileDto } from './dto/upsert-rh-profile.dto';
import { CreateRhSalaryPaymentDto } from './dto/create-rh-salary-payment.dto';
import {
  MemoryUploadedRhFile,
  RhService,
} from './rh.service';

@Controller('rh')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RhController {
  constructor(private readonly rh: RhService) {}

  @Get('overview')
  getOverview(@Query('period') period?: string) {
    return this.rh.getOverview(period);
  }

  @Put('profiles/:userId')
  upsertProfile(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: UpsertRhProfileDto,
  ) {
    return this.rh.upsertProfile(userId, body);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  addDocument(
    @UploadedFile() file: MemoryUploadedRhFile | undefined,
    @Body('userId') userId: string,
    @Body('tipo') tipo: string,
    @Body('referencia') referencia: string,
    @Body('validade') validade: string | undefined,
    @Body('estado') estado: string,
  ) {
    const dto = this.rh.parseCreateDocumentBody({
      userId,
      tipo,
      referencia,
      validade,
      estado,
    });
    return this.rh.addDocument(dto, file as MemoryUploadedRhFile);
  }

  @Get('documents/:documentId/file')
  async getDocumentFile(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType, downloadName } =
      await this.rh.getDocumentFileStream(documentId);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename="${encodeURIComponent(downloadName)}"`,
    });
  }

  @Delete('documents/:documentId')
  deleteDocument(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
  ) {
    return this.rh.deleteDocument(documentId);
  }

  @Post('attendance')
  addAttendance(@Body() body: CreateRhAttendanceDto) {
    return this.rh.addAttendance(body);
  }

  @Put('daily')
  upsertDaily(@Body() body: UpsertRhDailyDto) {
    return this.rh.upsertDaily(body);
  }

  @Post('daily/punch')
  registerPunch(@Body() body: RhDailyPunchDto) {
    return this.rh.registerPunch(body);
  }

  @Post('payments')
  createSalaryPayment(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: CreateRhSalaryPaymentDto,
  ) {
    return this.rh.createSalaryPayment(req.user, body);
  }

  @Delete('payments/:paymentId')
  deleteSalaryPayment(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ) {
    return this.rh.deleteSalaryPayment(req.user, paymentId);
  }
}
