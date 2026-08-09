import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { DesignTemplatesService } from './design-templates.service';

/**
 * Imagens de preview públicas por URL estável (`/previews/:fileName`).
 * O `<img src>` não envia JWT; apenas quem já tem lista de templates conhece o nome do ficheiro.
 */
@Controller('design-templates')
export class DesignTemplatesAssetsController {
  constructor(private readonly service: DesignTemplatesService) {}

  @Get('previews/:fileName')
  async preview(@Param('fileName') fileName: string): Promise<StreamableFile> {
    const { stream, mimeType } =
      await this.service.getStoredPreviewReadStream(fileName);
    return new StreamableFile(stream, { type: mimeType });
  }
}
