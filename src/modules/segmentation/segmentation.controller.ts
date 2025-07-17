import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SegmentationService } from './segmentation.service';
import { SegmentationDto } from './dto/segmentation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('segmentation')
@UseGuards(JwtAuthGuard)
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Post()
  segmentScript(
    @Body() segmentationDto: SegmentationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.segmentationService.segmentScript(segmentationDto, userId);
  }
}
