import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { SegmentationService } from './segmentation.service';
import { SegmentationDto } from './dto/segmentation.dto';
import { UpdateSegmentationDto } from './dto/update-segmentation.dto';
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

  @Get()
  async getStoredSegmentations(
    @CurrentUser('id') userId: string,
    @Query('id') segmentationId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (segmentationId) {
      return this.segmentationService.getSegmentationById(
        segmentationId,
        userId,
      );
    }
    return this.segmentationService.getAllSegmentations(userId, projectId);
  }

  @Patch(':id/select')
  async selectSegmentation(
    @Param('id') segmentationId: string,
    @Body() body: { projectId?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.segmentationService.selectSegmentation(
      segmentationId,
      userId,
      body.projectId,
    );
  }

  @Patch(':id')
  async updateSegmentation(
    @Param('id') segmentationId: string,
    @Body() updateSegmentationDto: UpdateSegmentationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.segmentationService.updateSegmentation(
      segmentationId,
      updateSegmentationDto,
      userId,
    );
  }
}
