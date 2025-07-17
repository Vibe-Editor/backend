import { Module } from '@nestjs/common';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [SegmentationController],
  providers: [SegmentationService],
})
export class SegmentationModule {}
