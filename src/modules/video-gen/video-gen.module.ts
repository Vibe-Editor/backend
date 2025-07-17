import { Module } from '@nestjs/common';
import { VideoGenController } from './video-gen.controller';
import { VideoGenService } from './video-gen.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [VideoGenController],
  providers: [VideoGenService],
})
export class VideoGenModule {}
