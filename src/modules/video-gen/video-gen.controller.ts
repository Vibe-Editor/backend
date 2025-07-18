import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { VideoGenService } from './video-gen.service';
import { VideoGenDto } from './dto/video-gen.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('video-gen')
@UseGuards(JwtAuthGuard)
export class VideoGenController {
  constructor(private readonly videoGenService: VideoGenService) {}

  @Post()
  generateVideo(
    @Body() videoGenDto: VideoGenDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.videoGenService.generateVideo(videoGenDto, userId);
  }
}
