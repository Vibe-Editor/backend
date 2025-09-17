import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PromptOptimizerService } from './prompt-optimizer.service';
import { PromptOptimizerDto } from './dto/prompt-optimizer.dto';
import { VideoGenWithOptimizationDto } from './dto/video-gen-with-optimization.dto';
import { OptimizeAndGenerateVideoDto } from './dto/optimize-and-generate-video.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('prompt-optimizer')
// @UseGuards(JwtAuthGuard)
@Public()
export class PromptOptimizerController {
  constructor(private readonly promptOptimizerService: PromptOptimizerService) {}

  @Post('optimize')
  async optimizePrompt(
    @Body() promptOptimizerDto: PromptOptimizerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.promptOptimizerService.optimizePrompt(promptOptimizerDto);
  }

  @Post('generate-video')
  async generateVideoWithOptimizedPrompt(
    @Body() videoGenDto: VideoGenWithOptimizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.promptOptimizerService.generateVideoWithOptimizedPrompt(videoGenDto, userId);
  }

  @Post('optimize-and-generate')
  async optimizeAndGenerateVideo(
    @Body() dto: OptimizeAndGenerateVideoDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.promptOptimizerService.optimizeAndGenerateVideo(dto, userId);
  }
}

