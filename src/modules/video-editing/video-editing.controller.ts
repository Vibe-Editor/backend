import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { VideoEditingService } from './video-editing.service';
import {
  VideoEditingRequestDto,
  VideoEditingResponseDto,
  VideoEditingStatusDto,
} from './dto/video-editing.dto';

@Controller('video-editing')
@UseGuards(JwtAuthGuard)
export class VideoEditingController {
  constructor(private readonly videoEditingService: VideoEditingService) {}

  @Post('runway-aleph')
  @HttpCode(HttpStatus.OK)
  async editVideo(
    @CurrentUser() user: any,
    @Body() requestDto: VideoEditingRequestDto,
    @Query('projectId') projectId: string,
  ): Promise<VideoEditingResponseDto> {
    return this.videoEditingService.editVideo(user.id, requestDto, projectId);
  }

  @Get('status/:operationId')
  async getVideoEditingStatus(
    @CurrentUser() user: any,
    @Param('operationId') operationId: string,
  ): Promise<VideoEditingStatusDto> {
    return this.videoEditingService.getVideoEditingStatus(user.id, operationId);
  }

  @Get('history')
  async getUserVideoEditingHistory(
    @CurrentUser() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    return this.videoEditingService.getUserVideoEditingHistory(
      user.id,
      pageNum,
      limitNum,
    );
  }

  @Post('runway-aleph/complete')
  @HttpCode(HttpStatus.OK)
  async editVideoAndWaitForCompletion(
    @CurrentUser() user: any,
    @Body() requestDto: VideoEditingRequestDto,
    @Query('projectId') projectId: string,
  ): Promise<{ s3Key: string; videoUrl: string; creditsUsed: number }> {
    return this.videoEditingService.editVideoAndWaitForCompletion(
      user.id,
      requestDto,
      projectId,
    );
  }
}
