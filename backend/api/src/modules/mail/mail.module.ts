import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { MailConfigService } from './mail-config.service';
import { MailService } from './mail.service';
import { SmtpMailService } from './smtp-mail.service';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [MailConfigService, SmtpMailService, MailService],
  exports: [MailService, SmtpMailService, MailConfigService],
})
export class MailModule {}
