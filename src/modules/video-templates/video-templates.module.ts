import { Module } from '@nestjs/common';
import { VideoTemplatesController } from './video-templates.controller';
import { VideoTemplatesService } from './video-templates.service';

@Module({
  controllers: [VideoTemplatesController],
  providers: [VideoTemplatesService],
  exports: [VideoTemplatesService],
})
export class VideoTemplatesModule {}