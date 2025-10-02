import { Controller, Post, Body, Get, Logger, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { VideoTemplatesService } from './video-templates.service';
import { FindSimilarTemplatesDto, SimilarTemplatesResponseDto, VideoTemplateResponseDto, CreateVideoTemplateDto } from './dto/video-template.dto';

@Controller('video-templates')
export class VideoTemplatesController {
  private readonly logger = new Logger(VideoTemplatesController.name);

  constructor(private readonly videoTemplatesService: VideoTemplatesService) { }

  @Post('find-similar')
  async findSimilarTemplates(
    @Body() findSimilarTemplatesDto: FindSimilarTemplatesDto,
  ): Promise<SimilarTemplatesResponseDto> {
    this.logger.log(`Finding similar templates for: "${findSimilarTemplatesDto.description}"`);
    const templates = await this.videoTemplatesService.findSimilarTemplates(
      findSimilarTemplatesDto.description,
    );

    return {
      templates,
      totalCount: templates.length,
    };
  }

  @Get()
  async getAllTemplates(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ): Promise<{
    data: VideoTemplateResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.log(`Fetching video templates - page: ${page}, limit: ${limit}`);

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    return this.videoTemplatesService.getAllTemplates(pageNum, limitNum);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() createTemplateDto: CreateVideoTemplateDto,
  ): Promise<VideoTemplateResponseDto> {
    this.logger.log(`Creating new video template: "${createTemplateDto.description.substring(0, 50)}..."`);
    return this.videoTemplatesService.createTemplate(createTemplateDto);
  }
}
