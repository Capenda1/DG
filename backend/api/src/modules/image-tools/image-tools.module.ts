import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageToolsController } from './image-tools.controller';
import { ImageToolsService } from './image-tools.service';

@Module({
  imports: [AuthModule],
  controllers: [ImageToolsController],
  providers: [ImageToolsService],
})
export class ImageToolsModule {}
