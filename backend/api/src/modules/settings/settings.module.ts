import { Module } from '@nestjs/common';
import { SettingsBrandingAssetsController } from './settings-branding-assets.controller';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, SettingsBrandingAssetsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
