import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CreditService } from '../credits/credit.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, CreditService],
})
export class ChatModule {}
