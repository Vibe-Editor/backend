import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  Put,
} from '@nestjs/common';
import { Headers } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { CreateBasicConceptDto, CreateVideoPreferencesDto, UpdateVideoPreferencesDto } from './dto/video-preference.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) { }

  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.create(createProjectDto, userId);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.projectsService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.findOne(id, userId);
  }

  @Get(':id/full')
  findOneWithAllContent(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.findOneWithAllContent(id, userId);
  }

  @Get(':id/conversations')
  findProjectConversations(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectConversations(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/concepts')
  findProjectConcepts(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectConcepts(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/images')
  findProjectImages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectImages(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/videos')
  findProjectVideos(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectVideos(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/voiceovers')
  findProjectVoiceovers(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectVoiceovers(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/segmentations')
  findProjectSegmentations(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectSegmentations(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/summaries')
  findProjectSummaries(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectSummaries(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }

  @Get(':id/research')
  findProjectResearch(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.projectsService.findProjectResearch(
      id,
      userId,
      pageNum,
      limitNum,
    );
  }


  // Updated Controller Methods
  @Post(':id/video-preferences')
  createVideoPreferences(
    @Param('id') projectId: string,
    @Body() createVideoPreferencesDto: CreateVideoPreferencesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.createVideoPreferences(
      projectId,
      createVideoPreferencesDto,
      userId
    );
  }

  @Patch(':id/video-preferences')
  updateVideoPreferences(
    @Param('id') projectId: string,
    @Body() updateVideoPreferencesDto: UpdateVideoPreferencesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.updateVideoPreferences(
      projectId,
      updateVideoPreferencesDto,
      userId
    );
  }

  @Get(':id/video-preferences')
  getVideoPreferences(
    @Param('id') projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.getVideoPreferences(projectId, userId);
  }


  @Post(':id/generate-basic-concept')
  generateBasicConcept(
    @Param('id') projectId: string,
    @Body() createBasicConceptDto: CreateBasicConceptDto, // Change this
    @CurrentUser('id') userId: string,
    @Headers('authorization') authorization: string,
  ) {
    const authToken = authorization?.replace('Bearer ', '');
    return this.projectsService.generateBasicConcept(projectId, createBasicConceptDto.userPrompt, userId, authToken , createBasicConceptDto.videoType);
  }


  @Post(':id/generate-segments-with-preferences')
  generateSegmentsWithPreferences(
    @Param('id') projectId: string,
    @CurrentUser('id') userId: string,
    @Headers('authorization') authorization: string,
    @Body() preferencesDto: CreateVideoPreferencesDto, // ADD THIS
  ) {
    const authToken = authorization?.replace('Bearer ', '');
    return this.projectsService.generateSegmentsWithPreferences(
      projectId,
      userId,
      authToken,
      preferencesDto // PASS THIS
    );
  }

  @Put(':segmentId/storyline')
  updateStorylineSegment(
    @Param('segmentId') userVideoSegmentId: string,
    @Body('content') content: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.updateStorylineSegmentById(userVideoSegmentId, content, userId);
  }

  @Put(':id/regenerate-segments')
  async regenerateSegments(
    @Param('id') projectId: string,
    @Body('segmentIds') segmentIds: string[],
    @Body('maxWordCount') maxWordCount: number,
    @Headers('authorization') authorization: string,
    @CurrentUser('id') userId: string,
  ) {
    const authToken = authorization?.replace('Bearer ', '');
    return this.projectsService.regenerateSegmentsWithWordLimit(segmentIds, maxWordCount, userId );
  }


  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.update(id, updateProjectDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.remove(id, userId);
  }
}
