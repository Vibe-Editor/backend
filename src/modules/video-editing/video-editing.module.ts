import { Module } from '@nestjs/common';
import { VideoEditingController } from './video-editing.controller';
import { VideoEditingService } from './video-editing.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [CreditsModule],
  controllers: [VideoEditingController],
  providers: [VideoEditingService],
  exports: [VideoEditingService],
})
export class VideoEditingModule {}
