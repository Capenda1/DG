import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DesignTemplateCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDesignTemplateDto } from './dto/create-design-template.dto';
import { UpdateDesignTemplateDto } from './dto/update-design-template.dto';

/** Ficheiro em memória (multer memoryStorage). */
export type MemoryUploadedPreview = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

/** Prefixo que guardamos em BD para previews servidos pela API em disco */
export const DESIGN_TEMPLATE_PREVIEW_KEY_PREFIX =
  '/api/design-templates/previews/';

const PREVIEW_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,8}$/i;

@Injectable()
export class DesignTemplatesService {
  private readonly log = new Logger(DesignTemplatesService.name);

  private readonly previewAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

  private readonly maxPreviewBytes = 8 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Pasta absoluta onde ficam `{uuid}.{ext}` */
  private previewDirAbsolute(): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'design-templates', 'previews');
  }

  private mimeForExt(lowerExt: string): string {
    if (lowerExt === '.png') return 'image/png';
    if (lowerExt === '.jpg' || lowerExt === '.jpeg') return 'image/jpeg';
    if (lowerExt === '.webp') return 'image/webp';
    return 'application/octet-stream';
  }

  private extForMime(mime: string): string {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/webp') return '.webp';
    return '.bin';
  }

  /** Extrai só o nome de ficheiro de uma `previewKey` nossa; caso contrário devolve null. */
  previewKeyToStoredFilename(
    previewKey: string | null | undefined,
  ): string | null {
    if (!previewKey?.startsWith(DESIGN_TEMPLATE_PREVIEW_KEY_PREFIX)) {
      return null;
    }
    const name = previewKey.slice(DESIGN_TEMPLATE_PREVIEW_KEY_PREFIX.length);
    const safe = decodeURIComponent(name);
    const base = safe.split('/').pop() ?? safe;
    if (!PREVIEW_REGEX.test(base)) return null;
    return base;
  }

  async maybeUnlinkStoredPreviewFile(
    previewKey: string | null | undefined,
  ): Promise<void> {
    const fileName = this.previewKeyToStoredFilename(previewKey);
    if (!fileName) return;
    const fullPath = join(this.previewDirAbsolute(), fileName);
    try {
      await unlink(fullPath);
    } catch {
      /* ficheiro já ausente ou permissões */
      this.log.debug(`Não foi possível apagar preview em disco: ${fullPath}`);
    }
  }

  async saveUploadedPreview(file: MemoryUploadedPreview): Promise<{
    previewKey: string;
  }> {
    if (!file.buffer?.length) {
      throw new BadRequestException('Envia uma imagem no campo file.');
    }
    if (!this.previewAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo não permitido. Usa PNG, JPEG ou WEBP.',
      );
    }
    if (file.size > this.maxPreviewBytes) {
      throw new BadRequestException('Imagem demasiado grande — máximo 8 MB.');
    }

    let ext = extname(file.originalname).toLowerCase();
    ext =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9]+$/.test(ext)
        ? ext
        : this.extForMime(file.mimetype);

    const storageKey = `${randomUUID()}${ext}`;
    const dir = this.previewDirAbsolute();
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, storageKey);

    await writeFile(fullPath, file.buffer);

    return {
      previewKey: `${DESIGN_TEMPLATE_PREVIEW_KEY_PREFIX}${storageKey}`,
    };
  }

  async getStoredPreviewReadStream(
    fileName: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const base = decodeURIComponent(fileName.trim());
    const onlyName = base.split(/[/\\]/).pop();
    if (!onlyName || !PREVIEW_REGEX.test(onlyName)) {
      throw new NotFoundException();
    }

    const fullPath = join(this.previewDirAbsolute(), onlyName);

    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException();
    }

    const mime = this.mimeForExt(extname(onlyName).toLowerCase());
    return {
      stream: createReadStream(fullPath),
      mimeType: mime,
    };
  }

  async findAll(opts?: { category?: string; onlyActive?: boolean }) {
    return this.prisma.designTemplate.findMany({
      where: {
        ...(opts?.onlyActive ? { active: true } : {}),
        ...(opts?.category
          ? { category: opts.category as DesignTemplateCategory }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        garmentType: true,
        previewKey: true,
        active: true,
        sortOrder: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const tpl = await this.prisma.designTemplate.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!tpl) throw new NotFoundException('Template não encontrado.');
    return tpl;
  }

  async create(dto: CreateDesignTemplateDto, userId: string) {
    return this.prisma.designTemplate.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: (dto.category ?? 'OUTROS') as DesignTemplateCategory,
        garmentType: dto.garmentType,
        previewKey: dto.previewKey,
        layersJson: (dto.layersJson ?? []) as object,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateDesignTemplateDto) {
    const prev = await this.findOne(id);
    const row = await this.prisma.designTemplate.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && {
          category: dto.category as DesignTemplateCategory,
        }),
        ...(dto.garmentType !== undefined && { garmentType: dto.garmentType }),
        ...(dto.previewKey !== undefined && { previewKey: dto.previewKey }),
        ...(dto.layersJson !== undefined && {
          layersJson: dto.layersJson as object,
        }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    if (
      dto.previewKey !== undefined &&
      prev.previewKey &&
      prev.previewKey !== dto.previewKey
    ) {
      await this.maybeUnlinkStoredPreviewFile(prev.previewKey);
    }

    return row;
  }

  async remove(id: string) {
    const tpl = await this.findOne(id);
    await this.maybeUnlinkStoredPreviewFile(tpl.previewKey);
    await this.prisma.designTemplate.delete({ where: { id } });
  }
}
