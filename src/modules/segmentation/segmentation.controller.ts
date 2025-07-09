import { Controller, Post, Body } from '@nestjs/common';
import { SegmentationService } from './segmentation.service';
import { SegmentationDto } from './dto/segmentation.dto';

@Controller('segmentation')
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Post()
  segmentScript(@Body() segmentationDto: SegmentationDto) {
    return this.segmentationService.segmentScript(segmentationDto);
  }
}
