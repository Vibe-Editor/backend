import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

  /**
   * Safely parse JSON string, return original value if parsing fails
   */
  private safeJsonParse(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch {
      // If parsing fails, return the original string
      // This handles cases where the field might not be JSON
      return jsonString;
    }
  }

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
              webResearchQueries: true,
              contentSummaries: true,
              videoSegmentations: true,
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
              webResearchQueries: true,
              contentSummaries: true,
              videoSegmentations: true,
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

  async findOneWithAllContent(id: string, userId: string) {
    this.logger.log(
      `Fetching project with all content: ${id} for user: ${userId}`,
    );

    try {
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
        include: {
          conversations: {
            orderBy: { createdAt: 'desc' },
          },
          videoConcepts: {
            orderBy: { createdAt: 'desc' },
          },
          webResearchQueries: {
            orderBy: { createdAt: 'desc' },
          },
          contentSummaries: {
            orderBy: { createdAt: 'desc' },
          },
          videoSegmentations: {
            include: {
              segments: {
                orderBy: { segmentId: 'asc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          generatedImages: {
            orderBy: { createdAt: 'desc' },
          },
          generatedVideos: {
            include: {
              videoFiles: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          generatedVoiceovers: {
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              conversations: true,
              videoConcepts: true,
              webResearchQueries: true,
              contentSummaries: true,
              videoSegmentations: true,
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

      // Find the selected segmentation
      const selectedSegmentation = project.videoSegmentations.find(
        (seg) => seg.isSelected,
      );

      // Parse JSON strings in conversation history
      const parsedConversations = project.conversations.map((conversation) => ({
        ...conversation,
        userInput: this.safeJsonParse(conversation.userInput),
        response: this.safeJsonParse(conversation.response),
      }));

      this.logger.log(`Project with all content found: ${project.id}`);

      return {
        success: true,
        project: {
          ...project,
          conversations: parsedConversations,
          selectedSegmentation,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch project with content: ${error.message}`,
      );
      throw error;
    }
  }

  async findProjectConversations(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching conversations for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [conversations, total] = await Promise.all([
        this.prisma.conversationHistory.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.conversationHistory.count({
          where: { projectId: id, userId },
        }),
      ]);

      // Parse JSON strings in conversations
      const parsedConversations = conversations.map((conversation) => ({
        ...conversation,
        userInput: this.safeJsonParse(conversation.userInput),
        response: this.safeJsonParse(conversation.response),
      }));

      this.logger.log(
        `Found ${conversations.length} conversations for project: ${id}`,
      );

      return {
        success: true,
        data: parsedConversations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch project conversations: ${error.message}`,
      );
      throw error;
    }
  }

  async findProjectConcepts(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching concepts for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [concepts, total] = await Promise.all([
        this.prisma.videoConcept.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.videoConcept.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(`Found ${concepts.length} concepts for project: ${id}`);

      return {
        success: true,
        data: concepts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project concepts: ${error.message}`);
      throw error;
    }
  }

  async findProjectImages(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching images for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [images, total] = await Promise.all([
        this.prisma.generatedImage.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.generatedImage.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(`Found ${images.length} images for project: ${id}`);

      return {
        success: true,
        data: images,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project images: ${error.message}`);
      throw error;
    }
  }

  async findProjectVideos(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching videos for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [videos, total] = await Promise.all([
        this.prisma.generatedVideo.findMany({
          where: { projectId: id, userId },
          include: {
            videoFiles: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.generatedVideo.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(`Found ${videos.length} videos for project: ${id}`);

      return {
        success: true,
        data: videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project videos: ${error.message}`);
      throw error;
    }
  }

  async findProjectVoiceovers(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching voiceovers for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [voiceovers, total] = await Promise.all([
        this.prisma.generatedVoiceover.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.generatedVoiceover.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(
        `Found ${voiceovers.length} voiceovers for project: ${id}`,
      );

      return {
        success: true,
        data: voiceovers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project voiceovers: ${error.message}`);
      throw error;
    }
  }

  async findProjectSegmentations(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching segmentations for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [segmentations, total] = await Promise.all([
        this.prisma.videoSegmentation.findMany({
          where: { projectId: id, userId },
          include: {
            segments: {
              orderBy: { segmentId: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.videoSegmentation.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(
        `Found ${segmentations.length} segmentations for project: ${id}`,
      );

      return {
        success: true,
        data: segmentations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch project segmentations: ${error.message}`,
      );
      throw error;
    }
  }

  async findProjectSummaries(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching summaries for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [summaries, total] = await Promise.all([
        this.prisma.contentSummary.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.contentSummary.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(`Found ${summaries.length} summaries for project: ${id}`);

      return {
        success: true,
        data: summaries,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project summaries: ${error.message}`);
      throw error;
    }
  }

  async findProjectResearch(
    id: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    this.logger.log(
      `Fetching research for project: ${id}, user: ${userId}, page: ${page}, limit: ${limit}`,
    );

    try {
      // First verify the project exists and belongs to the user
      const project = await this.prisma.project.findFirst({
        where: { id, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const skip = (page - 1) * limit;

      const [research, total] = await Promise.all([
        this.prisma.webResearchQuery.findMany({
          where: { projectId: id, userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.webResearchQuery.count({
          where: { projectId: id, userId },
        }),
      ]);

      this.logger.log(
        `Found ${research.length} research queries for project: ${id}`,
      );

      return {
        success: true,
        data: research,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project research: ${error.message}`);
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
