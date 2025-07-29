import { Module } from '@nestjs/common';
import { VoiceoverController } from './voiceover.controller';
import { VoiceoverService } from './voiceover.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, CreditsModule],
  controllers: [VoiceoverController],
  providers: [VoiceoverService],
})
export class VoiceoverModule {}
