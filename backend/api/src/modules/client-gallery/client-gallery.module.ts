import { Module } from '@nestjs/common';
import { ClientGalleryAssetsController } from './client-gallery-assets.controller';
import { ClientGalleryController } from './client-gallery.controller';
import { ClientGalleryService } from './client-gallery.service';

@Module({
  controllers: [ClientGalleryController, ClientGalleryAssetsController],
  providers: [ClientGalleryService],
})
export class ClientGalleryModule {}
