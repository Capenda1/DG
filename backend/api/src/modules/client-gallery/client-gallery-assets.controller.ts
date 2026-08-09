import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ClientGalleryService } from './client-gallery.service';

@Controller('client-gallery')
export class ClientGalleryAssetsController {
  constructor(private readonly service: ClientGalleryService) {}

  @Get('images/:fileName')
  async image(@Param('fileName') fileName: string): Promise<StreamableFile> {
    const { stream, mimeType } =
      await this.service.getStoredImageReadStream(fileName);
    return new StreamableFile(stream, { type: mimeType });
  }
}
