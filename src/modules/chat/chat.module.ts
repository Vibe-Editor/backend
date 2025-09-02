import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CreditService } from '../credits/credit.service';
import { VoiceGenService } from '../voice-gen/voice-gen.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, CreditService, VoiceGenService],
})
export class ChatModule {}
