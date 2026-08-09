import { Module } from '@nestjs/common';
import { DesignTemplatesAssetsController } from './design-templates-assets.controller';
import { DesignTemplatesController } from './design-templates.controller';
import { DesignTemplatesService } from './design-templates.service';

@Module({
  controllers: [DesignTemplatesController, DesignTemplatesAssetsController],
  providers: [DesignTemplatesService],
})
export class DesignTemplatesModule {}
