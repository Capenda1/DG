import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import configuration from './config/configuration';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientGalleryModule } from './modules/client-gallery/client-gallery.module';
import { DesignTemplatesModule } from './modules/design-templates/design-templates.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RootModule } from './modules/root/root.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SettingsModule } from './modules/settings/settings.module';
import { InsumosModule } from './modules/insumos/insumos.module';
import { ProductsModule } from './modules/products/products.module';
import { PrismaModule } from './prisma/prisma.module';
import { ImageToolsModule } from './modules/image-tools/image-tools.module';
import { FinanceModule } from './modules/finance/finance.module';
import { MailModule } from './modules/mail/mail.module';
import { RhModule } from './modules/rh/rh.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrderDocumentsModule } from './modules/order-documents/order-documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /** Garante .env em backend/api mesmo se o processo arrancar noutra pasta. */
      envFilePath: join(__dirname, '..', '.env'),
      load: [configuration],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 200 }],
    }),
    PrismaModule,
    RootModule,
    HealthModule,
    AuthModule,
    AdminModule,
    OrdersModule,
    DesignTemplatesModule,
    ClientGalleryModule,
    SettingsModule,
    MessagesModule,
    InsumosModule,
    ProductsModule,
    ImageToolsModule,
    FinanceModule,
    MailModule,
    RhModule,
    NotificationsModule,
    OrderDocumentsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
