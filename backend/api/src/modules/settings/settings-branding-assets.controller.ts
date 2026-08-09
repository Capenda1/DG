import {
  Controller,
  Get,
  Header,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Logótipos gravados na API (`/settings/branding/:file`) — públicos para `<img>` sem Bearer.
 */
@Controller('settings')
export class SettingsBrandingAssetsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('branding/:fileName')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @Header('Content-Disposition', 'inline')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async brandingLogo(
    @Param('fileName') fileName: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType } =
      await this.settings.getStoredLogoReadStream(fileName);
    return new StreamableFile(stream, { type: mimeType });
  }
}
