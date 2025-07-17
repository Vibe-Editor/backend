import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ProjectResponse,
  ProjectWithStats,
} from './interfaces/project.interface';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly prisma = new PrismaClient();

  async create(
    createProjectDto: CreateProjectDto,
    userId: string,
  ): Promise<ProjectResponse> {
    this.logger.log(`Creating project for user: ${userId}`);

    try {
      const project = await this.prisma.project.create({
        data: {
          ...createProjectDto,
          userId,
        },
      });

      this.logger.log(`Project created successfully: ${project.id}`);
      return project;
    } catch (error) {
      this.logger.error(`Failed to create project: ${error.message}`);
      throw error;
    }
  }

  async findAll(userId: string): Promise<ProjectWithStats[]> {
    this.logger.log(`Fetching all projects for user: ${userId}`);

    try {
      const projects = await this.prisma.project.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              conversations: true,
              videoConcepts: true,
              generatedImages: true,
              generatedVideos: true,
              generatedVoiceovers: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      this.logger.log(`Found ${projects.length} projects for user: ${userId}`);
      return projects;
    } catch (error) {
      this.logger.error(`Failed to fetch projects: ${error.message}`);
      throw error;
    }
  }

  async findOne(id: string, userId: string): Promise<ProjectWithStats> {
    this.logger.log(`Fetching project: ${id} for user: ${userId}`);

    try {
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
        include: {
          _count: {
            select: {
              conversations: true,
              videoConcepts: true,
              generatedImages: true,
              generatedVideos: true,
              generatedVoiceovers: true,
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      this.logger.log(`Project found: ${project.id}`);
      return project;
    } catch (error) {
      this.logger.error(`Failed to fetch project: ${error.message}`);
      throw error;
    }
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    userId: string,
  ): Promise<ProjectResponse> {
    this.logger.log(`Updating project: ${id} for user: ${userId}`);

    try {
      // Check if project exists and belongs to user
      const existingProject = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!existingProject) {
        throw new NotFoundException('Project not found');
      }

      const updatedProject = await this.prisma.project.update({
        where: { id },
        data: updateProjectDto,
      });

      this.logger.log(`Project updated successfully: ${updatedProject.id}`);
      return updatedProject;
    } catch (error) {
      this.logger.error(`Failed to update project: ${error.message}`);
      throw error;
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.log(`Deleting project: ${id} for user: ${userId}`);

    try {
      // Check if project exists and belongs to user
      const existingProject = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!existingProject) {
        throw new NotFoundException('Project not found');
      }

      await this.prisma.project.delete({
        where: { id },
      });

      this.logger.log(`Project deleted successfully: ${id}`);
    } catch (error) {
      this.logger.error(`Failed to delete project: ${error.message}`);
      throw error;
    }
  }
}
