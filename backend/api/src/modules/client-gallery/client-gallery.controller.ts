import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ClientGalleryService,
  type MemoryUploadedImage,
} from './client-gallery.service';
import { CreateClientGalleryItemDto } from './dto/create-client-gallery-item.dto';
import { UpdateClientGalleryItemDto } from './dto/update-client-gallery-item.dto';

type AuthUser = { id: string; role: UserRole };

function requireGalleryManager(user: AuthUser) {
  if (user.role !== 'ADMIN' && user.role !== 'DESIGNER') {
    throw new ForbiddenException(
      'Apenas Admin ou Designer podem gerir a galeria.',
    );
  }
}

@UseGuards(JwtAuthGuard)
@Controller('client-gallery')
export class ClientGalleryController {
  constructor(private readonly service: ClientGalleryService) {}

  @Get()
  findAll(
    @Req() req: Request & { user: AuthUser },
    @Query('all') all?: string,
  ) {
    const isManager = req.user.role === 'ADMIN' || req.user.role === 'DESIGNER';
    return this.service.findAll({
      onlyActive: !(isManager && all === 'true'),
    });
  }

  @Post('image-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() file: MemoryUploadedImage | undefined,
  ) {
    requireGalleryManager(req.user);
    if (!file?.buffer) {
      throw new BadRequestException('Envia um ficheiro no campo file.');
    }
    return this.service.saveUploadedImage(file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: CreateClientGalleryItemDto,
  ) {
    requireGalleryManager(req.user);
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateClientGalleryItemDto,
  ) {
    requireGalleryManager(req.user);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: AuthUser }, @Param('id') id: string) {
    requireGalleryManager(req.user);
    return this.service.remove(id);
  }
}
