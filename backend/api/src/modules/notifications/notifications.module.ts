import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TwilioSmsService } from './twilio-sms.service';

@Module({
  imports: [SettingsModule, MailModule],
  controllers: [NotificationsController],
  providers: [TwilioSmsService, NotificationsService],
  exports: [NotificationsService, TwilioSmsService],
})
export class NotificationsModule {}
