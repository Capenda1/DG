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
  DesignTemplatesService,
  type MemoryUploadedPreview,
} from './design-templates.service';
import { CreateDesignTemplateDto } from './dto/create-design-template.dto';
import { UpdateDesignTemplateDto } from './dto/update-design-template.dto';

type AuthUser = { id: string; role: UserRole };

function requireStaff(user: AuthUser) {
  if (user.role !== 'ADMIN' && user.role !== 'DESIGNER') {
    throw new ForbiddenException(
      'Apenas Admin ou Designer podem gerir templates.',
    );
  }
}

@UseGuards(JwtAuthGuard)
@Controller('design-templates')
export class DesignTemplatesController {
  constructor(private readonly service: DesignTemplatesService) {}

  @Get()
  findAll(
    @Req() req: Request & { user: AuthUser },
    @Query('category') category?: string,
    @Query('all') all?: string,
  ) {
    const isStaff = req.user.role === 'ADMIN' || req.user.role === 'DESIGNER';
    return this.service.findAll({
      category,
      onlyActive: !(isStaff && all === 'true'),
    });
  }

  /** Upload multipart — não envia preview em base64 no JSON */
  @Post('preview-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadPreview(
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() file: MemoryUploadedPreview | undefined,
  ) {
    requireStaff(req.user);
    if (!file?.buffer) {
      throw new BadRequestException('Envia um ficheiro no campo file.');
    }
    return this.service.saveUploadedPreview(file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: CreateDesignTemplateDto,
  ) {
    requireStaff(req.user);
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateDesignTemplateDto,
  ) {
    requireStaff(req.user);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: AuthUser }, @Param('id') id: string) {
    requireStaff(req.user);
    return this.service.remove(id);
  }
}
