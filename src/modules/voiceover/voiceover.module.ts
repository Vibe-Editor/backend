import { Module } from '@nestjs/common';
import { VoiceoverController } from './voiceover.controller';
import { VoiceoverService } from './voiceover.service';

@Module({
  controllers: [VoiceoverController],
  providers: [VoiceoverService]
})
export class VoiceoverModule {}
