import {
  BadRequestException,
  Controller,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ImageToolsService } from './image-tools.service';

type MulterMem = Express.Multer.File | undefined;

@Controller('image-tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.DESIGNER)
export class ImageToolsController {
  constructor(private readonly imageTools: ImageToolsService) {}

  @Get('enhance-ai/status')
  enhanceAiStatus() {
    return this.imageTools.getAiUpscaleMeta();
  }

  /** IA: um único pipeline (×2, sem reforço de faces); modelo conforme servidor (Replicate ou Upscayl Cloud). */
  @Post('enhance-ai')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async enhanceAi(@UploadedFile() file: MulterMem): Promise<StreamableFile> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um ficheiro no campo file.');
    }
    const scale = 2 as const;
    const faceEnhance = false;

    const { buffer, contentType } = await this.imageTools.upscaleImageWithAi({
      buffer: file.buffer,
      mimeType: file.mimetype ?? 'application/octet-stream',
      scale,
      faceEnhance,
    });

    return new StreamableFile(buffer, { type: contentType });
  }
}
