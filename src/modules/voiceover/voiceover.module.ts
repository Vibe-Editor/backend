import { Module } from '@nestjs/common';
import { VoiceoverController } from './voiceover.controller';
import { VoiceoverService } from './voiceover.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [VoiceoverController],
  providers: [VoiceoverService],
})
export class VoiceoverModule {}
