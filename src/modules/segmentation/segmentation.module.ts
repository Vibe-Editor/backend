import { Module } from '@nestjs/common';
import { SegmentationController } from './segmentation.controller';
import { WebSegmentController } from './web-segment.controller';
import { SegmentationService } from './segmentation.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { SummariesModule } from '../summaries/summaries.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, SummariesModule, CreditsModule],
  controllers: [SegmentationController, WebSegmentController],
  providers: [SegmentationService],
})
export class SegmentationModule {}
