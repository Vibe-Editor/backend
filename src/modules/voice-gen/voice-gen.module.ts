import { Module } from '@nestjs/common';
import { VoiceGenService } from './voice-gen.service';
import { VoiceGenController } from './voice-gen.controller';
import { CreditService } from '../credits/credit.service';

@Module({
  controllers: [VoiceGenController],
  providers: [VoiceGenService, CreditService],
  exports: [VoiceGenService],
})
export class VoiceGenModule {}
