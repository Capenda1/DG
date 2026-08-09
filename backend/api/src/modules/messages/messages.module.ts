import { Module } from '@nestjs/common';
import { MessagesBatchController } from './messages-batch.controller';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController, MessagesBatchController],
  providers: [MessagesService],
})
export class MessagesModule {}
