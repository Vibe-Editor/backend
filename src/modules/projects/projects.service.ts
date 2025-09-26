import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ProjectResponse,
  ProjectWithStats,
} from './interfaces/project.interface';
import {
  CreateVideoPreferencesDto,
  UpdateVideoPreferencesDto,
} from './dto/video-preference.dto';
import { VIDEO_PREFERENCE_OPTIONS } from './constants/video-preference-options';
import axios from 'axios';
import OpenAI from 'openai';
import { CreditService } from '../credits/credit.service';

export const WORKFLOW_STEPS = {
  INITIAL_SETUP: 'WORKFLOW_INITIAL_SETUP',
  SEGMENTS_GENERATED: 'WORKFLOW_SEGMENTS_GENERATED',
  VIDEOS_GENERATED: 'WORKFLOW_VIDEOS_GENERATED',
} as const;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly prisma = new PrismaClient();
  private baseUrl = process.env.BASE_URL;
  private readonly openai: OpenAI;

  // private baseUrl = 'http://localhost:8080'
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

  constructor(
    private readonly creditService: CreditService,
  ) {

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set.');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

      const highestStep = this.getHighestWorkflowStep(project.completedSteps);
      let stepData = null;
      let dataType = null;

      switch (highestStep) {
        case 'WORKFLOW_INITIAL_SETUP':
          stepData = await this.getInitialSetupData(id, userId);
          dataType = 'initial_setup';
          break;
        case 'WORKFLOW_SEGMENTS_GENERATED':
          stepData = await this.getSegmentsData(id);
          dataType = 'segments';
          break;
        case 'WORKFLOW_VIDEOS_GENERATED':
          stepData = await this.getVideosData(id);
          dataType = 'videos';
          break;
      }

      // this is for workflow status
      const workflowSteps = this.getWorkflowStepsOnly(project.completedSteps);

      this.logger.log(`Project found: ${project.id}`);
      return { ...project, workflowSteps, stepData:{type : dataType, data : stepData} };
    } catch (error) {
      this.logger.error(`Failed to fetch project: ${error.message}`);
      throw error;
    }
  }

  private async getInitialSetupData(projectId: string, userId: string) {
    // Get latest concept + web research
    const concept = await this.prisma.videoConcept.findFirst({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' }
    });

    const webResearch = await this.prisma.webResearchQuery.findFirst({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' }
    });

    return { concept, webResearch };
  }

  private async getSegmentsData(projectId: string) {
    return await this.prisma.userVideoSegment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' }
    });
  }

  private async getVideosData(projectId: string) {
    const videos = await this.prisma.generatedVideo.findMany({
      where: { projectId },
      include: { videoFiles: true }
    });

    const segments = await this.prisma.userVideoSegment.findMany({
      where: { projectId }
    });

    return { videos, segments };
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
      const workflowSteps = this.getWorkflowStepsOnly(project.completedSteps);

      return {
        success: true,
        project: {
          ...project,
          conversations: parsedConversations,
          selectedSegmentation,
          workflowSteps
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


  async getProjectSegments(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found or access denied');
    }

    // Get all segments for this project
    const segments = await this.prisma.userVideoSegment.findMany({
      where: {
        projectId,
        project: { userId } // Double check ownership
      },
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        projectId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      projectId,
      segments,
      count: segments.length,
    };
  }

  async getSegmentVideos(segmentId: string, userId: string) {
    // First check if segment exists and belongs to user
    const segment = await this.prisma.userVideoSegment.findFirst({
      where: {
        id: segmentId,
      },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
          }
        },
        resources: {
          select: {
            id: true,
            content: true,
            s3Key: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }

    // Check if user owns the project that contains this segment
    if (segment.project.userId !== userId) {
      throw new ForbiddenException('Access denied - segment does not belong to you');
    }

    // Format response with description from content JSON and add segmentId
    const videos = segment.resources.map(resource => ({
      id: resource.id,
      description: this.extractDescription(resource.content),
      jsonPrompt: resource.content,
      segmentId: segmentId,
      s3Key: resource.s3Key,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    }));

    return {
      segmentId,
      projectId: segment.project.id,
      videos,
      count: videos.length,
    };
  }

  private extractDescription(content: any): string {
    if (!content) return 'No description available';

    // Try different possible keys where description might be stored
    if (typeof content === 'object') {
      return content.description ||
        content.prompt ||
        content.userInput ||
        'Generated video content';
    }

    if (typeof content === 'string') {
      return content.substring(0, 100) + (content.length > 100 ? '...' : '');
    }

    return 'Generated video content';
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


  async getVideoPreferences(projectId: string, userId: string) {
    this.logger.log(`Getting video preferences for project: ${projectId}`);

    try {
      // Check if project exists and belongs to user
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Get video preferences
      const videoPreferences = await this.prisma.userVideoPreferences.findFirst(
        {
          where: { projectId },
        },
      );

      if (!videoPreferences) {
        throw new NotFoundException(
          'Video preferences not found for this project',
        );
      }

      this.logger.log(`Video preferences found: ${videoPreferences.id}`);

      return {
        success: true,
        data: videoPreferences,
      };
    } catch (error) {
      this.logger.error(`Failed to get video preferences: ${error.message}`);
      throw error;
    }
  }

  private buildFinalConfig(selections: {
    userPrompt: string;
    videoType: string;
    visualStyle: string;
    lightingMood: string;
    cameraStyle: string;
    subjectFocus: string;
    locationEnvironment: string;
  }): any {
    // Get JSON values for each selected option
    const visualStyleData =
      VIDEO_PREFERENCE_OPTIONS.visual_style[selections.visualStyle]
        ?.json_values || {};
    const lightingData =
      VIDEO_PREFERENCE_OPTIONS.lighting_mood[selections.lightingMood]
        ?.json_values || {};
    const cameraData =
      VIDEO_PREFERENCE_OPTIONS.camera_style[selections.cameraStyle]
        ?.json_values || {};
    const subjectData =
      VIDEO_PREFERENCE_OPTIONS.subject_focus[selections.subjectFocus]
        ?.json_values || {};
    const locationData =
      VIDEO_PREFERENCE_OPTIONS.location_environment[
        selections.locationEnvironment
      ]?.json_values || {};

    // Merge everything into final JSON structure
    return {
      shot: {
        composition:
          visualStyleData.composition || cameraData.shot_style || 'medium shot',
        camera_motion: cameraData.camera_motion || 'steady movement',
        frame_rate: cameraData.frame_rate || '30fps',
        film_grain: visualStyleData.film_grain || 'natural digital tone',
      },
      subject: {
        description: `${subjectData.subject_description} for ${selections.userPrompt}`,
        wardrobe: subjectData.wardrobe || 'contextual styling',
        action: subjectData.action || 'appropriate expressive action',
      },
      scene: {
        location: locationData.location || 'contextual location',
        time_of_day: lightingData.time_of_day || 'appropriate lighting',
        environment:
          locationData.environment ||
          lightingData.environment ||
          'visually aligned environment',
      },
      audio: {
        ambient: locationData.ambient || 'fitting ambient sounds',
        voice: {
          tone: lightingData.tone || 'brand-appropriate',
          style: cameraData.voice_style || 'clear delivery',
        },
      },
      visual_rules: {
        prohibited_elements: ['off-brand visuals', 'clutter'],
      },
      brand_integration: {
        platform_name: 'User Brand',
        visual_theme: visualStyleData.visual_theme || 'creative branded',
        color_palette: visualStyleData.color_palette || [
          'primary brand color',
          'secondary color',
          'accent',
        ],
        logo_appearance: 'subtle integration',
      },
    };
  }

  // First function: Generate basic concept from user prompt
  async generateBasicConcept(
    projectId: string,
    userPrompt: string,
    userId: string,
    authToken: string,
    videoType: string,
  ) {
    this.logger.log(`Step 1/2: Getting web info for project ${projectId}`);

    try {

      const existingPreferences = await this.prisma.userVideoPreferences.findFirst({
        where: { projectId },
      });

      if (existingPreferences) {
        // Update existing with userPrompt and videoType
        await this.prisma.userVideoPreferences.update({
          where: { projectId },
          data: {
            userPrompt,
            videoType // Save both fields
          }
        });
      } else {
        // Create new with userPrompt and videoType
        await this.prisma.userVideoPreferences.create({
          data: {
            projectId,
            userPrompt,
            videoType, // Save both fields
          }
        });
      }

      // 1. Get web info
      const webInfoResponse = await axios.post(
        `${this.baseUrl}/get-web-info`,
        {
          prompt: userPrompt,
          projectId,
          userId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          timeout: 60000,
        },
      );

      // 2. Generate basic concept (without user preferences)
      this.logger.log(`Step 2/2: Generating basic concept for project ${projectId}`);
      const conceptResponse = await axios.post(
        `${this.baseUrl}/concept-writer`,
        {
          prompt: userPrompt,
          web_info: JSON.stringify(webInfoResponse.data),
          projectId,
          userId,
          model: 'gpt-5',
          // Basic system prompt without preferences
          system_prompt: `Create ONE video concept for: "${userPrompt}"
        
        Return JSON:
        {
          "concepts": [{
            "title": "Video title",
            "concept": "5-6 line concept description",
            "tone": "Appropriate tone",
            "goal": "Video objective"
          }]
        }`,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          timeout: 60000,
        },
      );

      this.logger.log(`Successfully generated basic concept for project ${projectId}`);

      // Move WORKFLOW_INITIAL_SETUP to top (most recent)
      await this.updateWorkflowStep(projectId, 'WORKFLOW_INITIAL_SETUP');

      return {
        success: true,
        data: {
          webInfo: webInfoResponse.data,
          concept: conceptResponse.data.concepts[0],
          credits: conceptResponse.data.credits,
        },
      };
    } catch (error) {
      let failedStep = 'unknown';
      if (error.config?.url?.includes('/get-web-info')) {
        failedStep = 'Step 1/2: Web info generation';
      } else if (error.config?.url?.includes('/concept-writer')) {
        failedStep = 'Step 2/2: Basic concept generation';
      }

      this.logger.error(
        `Failed at ${failedStep} for project ${projectId}: ${error.message}`,
      );
      throw new Error(
        `Failed to generate basic concept at ${failedStep}: ${error.message}`,
      );
    }
  }


  // generateSegmentsWithPreferences function
  async generateSegmentsWithPreferences(
    projectId: string,
    userId: string,
    authToken: string,
    preferencesDto: CreateVideoPreferencesDto, // ADD THIS
  ) {
    this.logger.log(`Generating segments with preferences for project ${projectId}`);

    try {
      const existingPreferences = await this.prisma.userVideoPreferences.findFirst({
        where: { projectId },
      });

      if (!existingPreferences) {
        throw new NotFoundException('No basic concept generated yet. Please generate basic concept first.');
      }

      // Build finalConfig
      const finalConfig = this.buildFinalConfig({
        userPrompt: existingPreferences.userPrompt,
        videoType: existingPreferences.videoType,
        visualStyle: preferencesDto.visual_style,
        lightingMood: preferencesDto.lighting_mood,
        cameraStyle: preferencesDto.camera_style,
        subjectFocus: preferencesDto.subject_focus,
        locationEnvironment: preferencesDto.location_environment,
      });

      // Save or update preferences
      const preferences = await this.prisma.userVideoPreferences.update({
        where: { projectId },
        data: {
          visualStyle: preferencesDto.visual_style,
          lightingMood: preferencesDto.lighting_mood,
          cameraStyle: preferencesDto.camera_style,
          subjectFocus: preferencesDto.subject_focus,
          locationEnvironment: preferencesDto.location_environment,
          finalConfig,
        }
      })


      if (!preferences) {
        throw new NotFoundException('Video preferences not found for this project');
      }

      // Get the latest concept for this project
      const latestConcept = await this.prisma.videoConcept.findFirst({
        where: { projectId, userId },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestConcept) {
        throw new NotFoundException('No concept found for this project. Please generate a basic concept first.');
      }

      // Generate story segments using concept + preferences WITH finalConfig
      this.logger.log(`Generating story segments with visual preferences for project ${projectId}`);
      const segmentationResponse = await axios.post(
        `${this.baseUrl}/segmentation`,
        {
          prompt: preferences.userPrompt,
          concept: latestConcept.concept,
          projectId,
          userId,
          model: 'gpt-5',
          mode: 'story',
          // Pass the full finalConfig JSON and word count
          preferences: {
            visualStyle: preferences.visualStyle,
            lightingMood: preferences.lightingMood,
            cameraStyle: preferences.cameraStyle,
            subjectFocus: preferences.subjectFocus,
            locationEnvironment: preferences.locationEnvironment,
            finalConfig: preferences.finalConfig, // Pass the rich JSON
            wordCount: preferences.wordCount || 150, // Pass word count
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          timeout: 60000,
        },
      );

      this.logger.log(`Successfully generated segments with visual preferences for project ${projectId}`);

      // Move WORKFLOW_SEGMENTS_GENERATED to top after successful segmentation
      await this.updateWorkflowStep(projectId, 'WORKFLOW_SEGMENTS_GENERATED');


      return {
        success: true,
        data: {
          // concept: latestConcept,
          // preferences,
          storySegments: segmentationResponse.data.segments,
          credits: segmentationResponse.data.credits,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate segments with preferences for project ${projectId}: ${error.message}`,
      );
      throw new Error(
        `Failed to generate segments with preferences: ${error.message}`,
      );
    }
  }


  private buildVideoSystemPrompt(preferences: any): string {
    return `Create ONE video concept for: "${preferences.userPrompt}"

  Use these visual settings:
    - Video Type: ${preferences.videoType}
    - Style: ${preferences.visualStyle}
    - Lighting: ${preferences.lightingMood}  
    - Camera: ${preferences.cameraStyle}
    - Subject: ${preferences.subjectFocus}
    - Location: ${preferences.locationEnvironment}

  Return JSON:
  {
    "concepts": [{
      "title": "Title about the iPhone app",
      "concept": "5-6 line concept about showcasing the iPhone app with these visual settings",
      "tone": "Professional and clean",
      "goal": "Showcase the iPhone app effectively"
    }]
  }`;
  }

  private buildVideoConceptPrompt(preferences: any, webInfo: any): string {
    return `${preferences.userPrompt}

Visual Requirements:
- Style: ${preferences.visualStyle}
- Lighting: ${preferences.lightingMood} 
- Camera: ${preferences.cameraStyle}
- Subject: ${preferences.subjectFocus}
- Location: ${preferences.locationEnvironment}

Research Context: ${JSON.stringify(webInfo)}`;
  }

  async updateStorylineSegmentById(
    userVideoSegmentId: string,
    newContent: string,
    userId: string,
  ) {
    this.logger.log(`Updating segment with ID: ${userVideoSegmentId}`);

    try {
      // Find the segment by ID
      const existingSegment = await this.prisma.userVideoSegment.findUnique({
        where: { id: userVideoSegmentId },
        include: { project: true }, // To verify ownership
      });

      if (!existingSegment) {
        throw new NotFoundException(
          `Segment with ID ${userVideoSegmentId} not found`,
        );
      }

      // Ensure the user owns this segment
      if (existingSegment.project.userId !== userId) {
        throw new ForbiddenException(
          `You don't have access to update this segment`,
        );
      }

      const segmentType = existingSegment.type;
      const projectId = existingSegment.projectId;

      // Update the segment description
      const updatedSegment = await this.prisma.userVideoSegment.update({
        where: { id: userVideoSegmentId },
        data: { description: newContent },
      });

      // Log the update in conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'PROJECT_CONTEXT_UPDATE',
          userInput: `Updated ${segmentType} segment`,
          response: JSON.stringify({
            action: 'update_story_segment',
            userVideoSegmentId,
            segmentType,
            oldContent: existingSegment.description,
            newContent,
          }),
          metadata: { segmentUpdated: segmentType },
          projectId,
          userId,
        },
      });

      return {
        success: true,
        data: { userVideoSegmentId, segmentType, newContent, updatedSegment },
        message: `${segmentType} segment updated successfully`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update segment ${userVideoSegmentId}: ${error.message}`,
      );
      throw error;
    }
  }


  async regenerateSegmentsWithWordLimit(
    segmentIds: string[],
    maxWords: number,
    userId: string,
  ) {
    this.logger.log(
      `Starting regeneration of ${segmentIds.length} segments with ${maxWords} word limit for user: ${userId}`,
    );

    const startTime = Date.now();

    // ===== CREDIT DEDUCTION =====
    this.logger.log(`Deducting credits for segment regeneration`);

    // Deduct credits first - 10 credits per regeneration operation
    const creditTransactionId = await this.creditService.deductCredits(
      userId,
      'TEXT_OPERATIONS',
      'segmentation',
      `regeneration-${Date.now()}`,
      false,
      `Segment regeneration for ${segmentIds.length} segments`,
    );

    this.logger.log(
      `Successfully deducted 10 credits for regeneration. Transaction ID: ${creditTransactionId}`,
    );
    // ===== END CREDIT DEDUCTION =====

    try {
      // 🔥 Single DB call to get all segments at once
      this.logger.log(`Fetching all ${segmentIds.length} segments for user ${userId}`);

      const segments = await this.prisma.userVideoSegment.findMany({
        where: {
          id: { in: segmentIds },
          project: {
            userId: userId, // Security check - only user's segments through project
          },
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      this.logger.log(`Found ${segments.length} valid segments out of ${segmentIds.length} requested`);

      if (segments.length === 0) {
        this.logger.warn(`No valid segments found for user ${userId}`);

        // Refund credits if no valid segments found
        await this.creditService.refundCredits(
          userId,
          'TEXT_OPERATIONS',
          'segmentation',
          `regeneration-${Date.now()}`,
          creditTransactionId,
          false,
          'Refund for regeneration - no valid segments found',
        );

        return [];
      }

      // Log any missing segments
      const foundSegmentIds = new Set(segments.map(s => s.id));
      const missingSegments = segmentIds.filter(id => !foundSegmentIds.has(id));
      if (missingSegments.length > 0) {
        this.logger.warn(`Missing/unauthorized segments: ${missingSegments.join(', ')}`);
      }

      // Get the project ID for conversation history (use the first segment's project)
      const projectId = segments[0]?.projectId;

      // Process all GPT calls concurrently (no DB updates yet)
      const gptPromises = segments.map(async (segment, index) => {
        this.logger.log(`Processing GPT call ${index + 1}/${segments.length}: ${segment.id}`);

        try {
          this.logger.log(`Calling GPT-latest for segment ${segment.id} regeneration`);

          // 🔥 Direct GPT-5 call
          const completion = await this.openai.chat.completions.create({
            model: 'gpt-5-chat-latest',
            messages: [
              {
                role: 'system',
                content: `You are a helpful assistant. Regenerate the given video segment in exactly ${maxWords} words. Return ONLY plain text (no JSON, no markdown).`,
              },
              {
                role: 'user',
                content: segment.description,
              },
            ],
          });

          const newContent = completion.choices[0]?.message?.content?.trim() || null;

          if (!newContent) {
            throw new Error('No content returned from GPT-5');
          }

          this.logger.log(`GPT-5 successfully regenerated content for segment ${segment.id}`);

          return {
            segmentId: segment.id,
            segmentType: segment.type,
            originalContent: segment.description,
            newContent,
            success: true,
          };

        } catch (err) {
          this.logger.error(
            `Failed GPT call for segment ${segment.id}: ${(err as Error).message}`,
          );
          return {
            segmentId: segment.id,
            segmentType: segment.type,
            originalContent: segment.description,
            newContent: null,
            success: false,
            error: (err as Error).message,
          };
        }
      });

      this.logger.log(`Waiting for all ${segments.length} GPT calls to complete`);

      // Wait for all GPT calls to complete
      const gptResults = await Promise.allSettled(gptPromises);
      const successfulResults = gptResults
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .map(result => (result as PromiseFulfilledResult<any>).value);

      this.logger.log(`${successfulResults.length} GPT calls succeeded, preparing bulk database update`);

      if (successfulResults.length === 0) {
        this.logger.warn('No successful GPT regenerations, refunding credits and skipping database updates');

        // Refund credits if no successful regenerations
        await this.creditService.refundCredits(
          userId,
          'TEXT_OPERATIONS',
          'segmentation',
          `regeneration-${Date.now()}`,
          creditTransactionId,
          false,
          'Refund for regeneration - all GPT calls failed',
        );

        return [];
      }

      // 🔥 Bulk update all segments in a single transaction
      this.logger.log(`Performing bulk update for ${successfulResults.length} segments`);

      const updatePromises = successfulResults.map(result =>
        this.prisma.userVideoSegment.update({
          where: { id: result.segmentId },
          data: {
            description: result.newContent,
            updatedAt: new Date(), // Explicitly update timestamp
          },
        })
      );

      // Execute all updates concurrently
      const updateResults = await Promise.allSettled(updatePromises);
      const successfulUpdates = updateResults
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<any>).value);

      const processingTime = Date.now() - startTime;
      const gptSuccessCount = successfulResults.length;
      const gptFailureCount = segments.length - gptSuccessCount;
      const dbSuccessCount = successfulUpdates.length;
      const dbFailureCount = successfulResults.length - dbSuccessCount;
      const totalRequestedCount = segmentIds.length;

      // Get user's new balance after credit deduction
      const newBalance = await this.creditService.getUserBalance(userId);

      this.logger.log(
        `Regeneration completed in ${processingTime}ms. GPT Success: ${gptSuccessCount}, GPT Failed: ${gptFailureCount}, DB Success: ${dbSuccessCount}, DB Failed: ${dbFailureCount}, Found: ${segments.length}, Requested: ${totalRequestedCount}. Credits used: 10, New balance: ${newBalance.toNumber()}`,
      );

      if (gptFailureCount > 0) {
        this.logger.warn(`${gptFailureCount} segments failed GPT regeneration`);
      }

      if (dbFailureCount > 0) {
        this.logger.warn(`${dbFailureCount} segments failed database update`);
      }

      if (missingSegments.length > 0) {
        this.logger.warn(`${missingSegments.length} segments were not found or unauthorized`);
      }

      // Add credits info to response
      const response = successfulUpdates.map(segment => ({
        ...segment,
        credits: {
          used: 10,
          balance: newBalance.toNumber(),
        },
      }));

      // Move WORKFLOW_SEGMENTS_GENERATED to top after successful segmentation
      await this.updateWorkflowStep(projectId, 'WORKFLOW_SEGMENTS_GENERATED');


      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Failed to regenerate segments after ${processingTime}ms: ${(error as Error).message}`,
      );

      // Refund credits on failure
      try {
        await this.creditService.refundCredits(
          userId,
          'TEXT_OPERATIONS',
          'segmentation',
          `regeneration-${Date.now()}`,
          creditTransactionId,
          false,
          `Refund for failed regeneration: ${error.message}`,
        );
        this.logger.log(`Successfully refunded 10 credits for failed regeneration. User: ${userId}`);
      } catch (refundError) {
        this.logger.error(`Failed to refund credits for regeneration: ${refundError.message}`);
      }

      throw error;
    }
  }


  // Helper function to move workflow state to top (most recent first)
  private async updateWorkflowStep(projectId: string, step: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { completedSteps: true }
    });

    const currentSteps = project?.completedSteps || [];

    // Remove the step if it already exists (to avoid duplicates)
    const filteredSteps = currentSteps.filter(s => s !== step);

    // Add the step to the beginning (most recent first)
    const updatedSteps = [step, ...filteredSteps];

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        completedSteps: updatedSteps
      }
    });
  }

  private getWorkflowStepsOnly(completedSteps: string[]): string[] {
    const workflowSteps = [
      WORKFLOW_STEPS.INITIAL_SETUP,
      WORKFLOW_STEPS.SEGMENTS_GENERATED,
      WORKFLOW_STEPS.VIDEOS_GENERATED,
    ];

    return completedSteps.filter(step => workflowSteps.includes(step as any));
  }

  private getHighestWorkflowStep(completedSteps: string[]): string | null {
    const workflowSteps = [
      'WORKFLOW_INITIAL_SETUP',
      'WORKFLOW_SEGMENTS_GENERATED',
      'WORKFLOW_VIDEOS_GENERATED'
    ];

    // Find the highest step that exists in completedSteps
    for (const step of completedSteps) {
      if (workflowSteps.includes(step)) {
        return step; // Return the first (most recent) workflow step found
      }
    }
    return null;
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
