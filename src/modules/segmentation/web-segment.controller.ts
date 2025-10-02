import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SegmentationService } from './segmentation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { CreateSegmentDto } from './dto/create-segment.dto';

@Controller('web')
@UseGuards(JwtAuthGuard)
export class WebSegmentController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Post('segment')
  async createSegment(
    @Body() dto: CreateSegmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.segmentationService.createSingleSegment(dto, userId);
  }
}


