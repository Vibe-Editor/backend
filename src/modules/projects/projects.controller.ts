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
