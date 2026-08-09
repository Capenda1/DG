import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderDocumentsService } from './order-documents.service';

@Module({
  imports: [AuthModule],
  controllers: [OrderDocumentsController],
  providers: [OrderDocumentsService],
  exports: [OrderDocumentsService],
})
export class OrderDocumentsModule {}
