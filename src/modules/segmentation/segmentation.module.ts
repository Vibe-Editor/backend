import { Module } from '@nestjs/common';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { SummaryModule } from '../../common/services/summary.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, SummaryModule, CreditsModule],
  controllers: [SegmentationController],
  providers: [SegmentationService],
})
export class SegmentationModule {}
