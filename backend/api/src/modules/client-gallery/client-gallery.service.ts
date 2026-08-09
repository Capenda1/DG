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
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientGalleryItemDto } from './dto/create-client-gallery-item.dto';
import { UpdateClientGalleryItemDto } from './dto/update-client-gallery-item.dto';

export type MemoryUploadedImage = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export const CLIENT_GALLERY_IMAGE_KEY_PREFIX = '/api/client-gallery/images/';

const IMAGE_REGEX =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-z0-9]{1,8}$/i;

@Injectable()
export class ClientGalleryService {
  private readonly log = new Logger(ClientGalleryService.name);

  private readonly imageAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);

  private readonly maxImageBytes = 10 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private imageDirAbsolute(): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'client-gallery', 'images');
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

  imageKeyToStoredFilename(imageKey: string | null | undefined): string | null {
    if (!imageKey?.startsWith(CLIENT_GALLERY_IMAGE_KEY_PREFIX)) {
      return null;
    }
    const name = imageKey.slice(CLIENT_GALLERY_IMAGE_KEY_PREFIX.length);
    const safe = decodeURIComponent(name);
    const base = safe.split('/').pop() ?? safe;
    if (!IMAGE_REGEX.test(base)) return null;
    return base;
  }

  async maybeUnlinkStoredImageFile(
    imageKey: string | null | undefined,
  ): Promise<void> {
    const fileName = this.imageKeyToStoredFilename(imageKey);
    if (!fileName) return;
    const fullPath = join(this.imageDirAbsolute(), fileName);
    try {
      await unlink(fullPath);
    } catch {
      this.log.debug(`Não foi possível apagar imagem em disco: ${fullPath}`);
    }
  }

  async saveUploadedImage(file: MemoryUploadedImage): Promise<{ imageKey: string }> {
    if (!file.buffer?.length) {
      throw new BadRequestException('Envia uma imagem no campo file.');
    }
    if (!this.imageAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo não permitido. Usa PNG, JPEG ou WEBP.',
      );
    }
    if (file.size > this.maxImageBytes) {
      throw new BadRequestException('Imagem demasiado grande — máximo 10 MB.');
    }

    let ext = extname(file.originalname).toLowerCase();
    ext =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9]+$/.test(ext)
        ? ext
        : this.extForMime(file.mimetype);

    const storageKey = `${randomUUID()}${ext}`;
    const dir = this.imageDirAbsolute();
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, storageKey);

    await writeFile(fullPath, file.buffer);

    return {
      imageKey: `${CLIENT_GALLERY_IMAGE_KEY_PREFIX}${storageKey}`,
    };
  }

  async getStoredImageReadStream(
    fileName: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const base = decodeURIComponent(fileName.trim());
    const onlyName = base.split(/[/\\]/).pop();
    if (!onlyName || !IMAGE_REGEX.test(onlyName)) {
      throw new NotFoundException();
    }

    const fullPath = join(this.imageDirAbsolute(), onlyName);

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

  async findAll(opts?: { onlyActive?: boolean }) {
    return this.prisma.clientGalleryItem.findMany({
      where: {
        ...(opts?.onlyActive ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        imageKey: true,
        active: true,
        sortOrder: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.clientGalleryItem.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Item da galeria não encontrado.');
    return item;
  }

  async create(dto: CreateClientGalleryItemDto, userId: string) {
    return this.prisma.clientGalleryItem.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageKey: dto.imageKey,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateClientGalleryItemDto) {
    const prev = await this.findOne(id);
    const row = await this.prisma.clientGalleryItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageKey !== undefined && { imageKey: dto.imageKey }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    if (
      dto.imageKey !== undefined &&
      prev.imageKey &&
      prev.imageKey !== dto.imageKey
    ) {
      await this.maybeUnlinkStoredImageFile(prev.imageKey);
    }

    return row;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.maybeUnlinkStoredImageFile(item.imageKey);
    await this.prisma.clientGalleryItem.delete({ where: { id } });
  }
}
