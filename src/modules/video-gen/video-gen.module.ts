import { Module } from '@nestjs/common';
import { VideoGenController } from './video-gen.controller';
import { VideoGenService } from './video-gen.service';

@Module({
  controllers: [VideoGenController],
  providers: [VideoGenService]
})
export class VideoGenModule {}
