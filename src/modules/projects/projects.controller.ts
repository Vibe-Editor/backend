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
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
