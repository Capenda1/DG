import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BackupService, type BackupKind } from './backup.service';

@Controller('admin/backups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Post()
  create(@Body() body: { kind?: string }) {
    const kind = (body?.kind ?? '').trim() as BackupKind;
    if (kind !== 'database' && kind !== 'uploads' && kind !== 'full') {
      throw new BadRequestException(
        'kind deve ser database, uploads ou full.',
      );
    }
    return this.backups.create(kind);
  }

  @Get(':name')
  async download(@Param('name') name: string, @Res() res: Response) {
    const { absolutePath, downloadName, sizeBytes } =
      await this.backups.resolveDownload(name);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"`,
    );
    res.setHeader('Content-Length', String(sizeBytes));

    const stream = createReadStream(absolutePath);
    const cleanup = () => {
      void this.backups.removeAfterDownload(absolutePath);
    };
    stream.on('close', cleanup);
    stream.on('error', (err) => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ message: err.message });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }
}
