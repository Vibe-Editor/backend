import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ProjectHelperService {
  private readonly logger = new Logger(ProjectHelperService.name);
  private readonly prisma = new PrismaClient();

  async ensureUserHasProject(userId: string): Promise<string> {
    this.logger.log(`Ensuring user ${userId} has a project`);

    try {
      // First, try to find an existing project for the user
      const existingProject = await this.prisma.project.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }, // Get the most recent project
      });

      if (existingProject) {
        this.logger.log(`Found existing project: ${existingProject.id}`);
        return existingProject.id;
      }

      // If no project exists, create a default one
      this.logger.log(
        `No project found for user ${userId}, creating default project`,
      );

      const defaultProject = await this.prisma.project.create({
        data: {
          name: 'My First Video Project',
          description: 'Auto-created project for your video content',
          userId,
        },
      });

      this.logger.log(`Created default project: ${defaultProject.id}`);
      return defaultProject.id;
    } catch (error) {
      this.logger.error('Error ensuring user has project:', error);
      throw error;
    }
  }

  async getOrCreateDefaultProject(userId: string): Promise<string> {
    return this.ensureUserHasProject(userId);
  }
}
