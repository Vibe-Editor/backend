import { Module } from '@nestjs/common';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';

@Module({
  controllers: [SegmentationController],
  providers: [SegmentationService]
})
export class SegmentationModule {}
