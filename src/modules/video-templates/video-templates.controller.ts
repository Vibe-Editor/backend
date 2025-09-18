import { Controller, Post, Body, Get, Logger, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { VideoTemplatesService } from './video-templates.service';
import { FindSimilarTemplatesDto, SimilarTemplatesResponseDto, VideoTemplateResponseDto, CreateVideoTemplateDto } from './dto/video-template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('video-templates')
@UseGuards(JwtAuthGuard)
export class VideoTemplatesController {
  private readonly logger = new Logger(VideoTemplatesController.name);

  constructor(private readonly videoTemplatesService: VideoTemplatesService) {}

  @Post('find-similar')
  async findSimilarTemplates(
    @Body() findSimilarTemplatesDto: FindSimilarTemplatesDto,
    @CurrentUser() user: any,
  ): Promise<SimilarTemplatesResponseDto> {
    this.logger.log(`User ${user.id} finding similar templates for: "${findSimilarTemplatesDto.description}"`);
    
    const templates = await this.videoTemplatesService.findSimilarTemplates(
      findSimilarTemplatesDto.description,
    );

    return {
      templates,
      totalCount: templates.length,
    };
  }

  @Get()
  async getAllTemplates(@CurrentUser() user: any): Promise<VideoTemplateResponseDto[]> {
    this.logger.log(`User ${user.id} fetching all video templates`);
    return this.videoTemplatesService.getAllTemplates();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() createTemplateDto: CreateVideoTemplateDto,
    @CurrentUser() user: any,
  ): Promise<VideoTemplateResponseDto> {
    this.logger.log(`User ${user.id} creating new video template: "${createTemplateDto.description.substring(0, 50)}..."`);
    return this.videoTemplatesService.createTemplate(createTemplateDto);
  }
}
