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
import { CreateVideoPreferencesDto, UpdateVideoPreferencesDto } from './dto/video-preference.dto';
import { VIDEO_PREFERENCE_OPTIONS } from './constants/video-preference-options';
import axios from 'axios';
import { ConceptWriterDto } from '../concept-writer/dto/concept-writer.dto';
import OpenAI from 'openai';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly prisma = new PrismaClient();
  private baseUrl = "http://localhost:8080";
  // private baseUrl = process.env.BASE_URL;

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


  async createVideoPreferences(
    projectId: string,
    createDto: CreateVideoPreferencesDto,
    userId: string,
  ) {
    this.logger.log(`Creating video preferences for project: ${projectId}`);

    try {
      // Check if project exists and belongs to user
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Check if preferences already exist for this project
      const existingPreferences = await this.prisma.userVideoPreferences.findFirst({
        where: { projectId },
      });

      if (existingPreferences) {
        throw new BadRequestException('Video preferences already exist for this project');
      }

      // Build the final config from selected options
      const finalConfig = this.buildFinalConfig({
        userPrompt: createDto.user_prompt,
        videoType: createDto.video_type,
        visualStyle: createDto.visual_style,
        lightingMood: createDto.lighting_mood,
        cameraStyle: createDto.camera_style,
        subjectFocus: createDto.subject_focus,
        locationEnvironment: createDto.location_environment,
      });

      // Create video preferences
      const videoPreferences = await this.prisma.userVideoPreferences.create({
        data: {
          projectId,
          videoType: createDto.video_type,
          userPrompt: createDto.user_prompt,
          visualStyle: createDto.visual_style,
          lightingMood: createDto.lighting_mood,
          cameraStyle: createDto.camera_style,
          subjectFocus: createDto.subject_focus,
          locationEnvironment: createDto.location_environment,
          finalConfig,
        },
      });

      this.logger.log(`Video preferences created: ${videoPreferences.id}`);

      return {
        success: true,
        data: videoPreferences,
      };
    } catch (error) {
      this.logger.error(`Failed to create video preferences: ${error.message}`);
      throw error;
    }
  }

  async updateVideoPreferences(
    projectId: string,
    updateDto: UpdateVideoPreferencesDto,
    userId: string,
  ) {
    this.logger.log(`Updating video preferences for project: ${projectId}`);

    try {
      // Check if project exists and belongs to user
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Check if preferences exist
      const existingPreferences = await this.prisma.userVideoPreferences.findFirst({
        where: { projectId },
      });

      if (!existingPreferences) {
        throw new NotFoundException('Video preferences not found for this project');
      }

      // Merge updated values with existing ones
      const updatedData = {
        ...existingPreferences,
        ...Object.fromEntries(
          Object.entries(updateDto).map(([key, value]) => [
            key === 'user_prompt' ? 'userPrompt' :
              key === 'video_type' ? 'videoType' :
                key === 'visual_style' ? 'visualStyle' :
                  key === 'lighting_mood' ? 'lightingMood' :
                    key === 'camera_style' ? 'cameraStyle' :
                      key === 'subject_focus' ? 'subjectFocus' :
                        key === 'location_environment' ? 'locationEnvironment' : key,
            value
          ]).filter(([_, value]) => value !== undefined)
        ),
      };

      // Rebuild final config with updated values
      const finalConfig = this.buildFinalConfig({
        userPrompt: updatedData.userPrompt,
        videoType: updatedData.videoType,
        visualStyle: updatedData.visualStyle,
        lightingMood: updatedData.lightingMood,
        cameraStyle: updatedData.cameraStyle,
        subjectFocus: updatedData.subjectFocus,
        locationEnvironment: updatedData.locationEnvironment,
      });

      // Update preferences
      const videoPreferences = await this.prisma.userVideoPreferences.update({
        where: { projectId },
        data: {
          ...(updateDto.user_prompt && { userPrompt: updateDto.user_prompt }),
          ...(updateDto.video_type && { videoType: updateDto.video_type }),
          ...(updateDto.visual_style && { visualStyle: updateDto.visual_style }),
          ...(updateDto.lighting_mood && { lightingMood: updateDto.lighting_mood }),
          ...(updateDto.camera_style && { cameraStyle: updateDto.camera_style }),
          ...(updateDto.subject_focus && { subjectFocus: updateDto.subject_focus }),
          ...(updateDto.location_environment && { locationEnvironment: updateDto.location_environment }),
          finalConfig,
        },
      });

      this.logger.log(`Video preferences updated: ${videoPreferences.id}`);

      return {
        success: true,
        data: videoPreferences,
      };
    } catch (error) {
      this.logger.error(`Failed to update video preferences: ${error.message}`);
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
      const videoPreferences = await this.prisma.userVideoPreferences.findFirst({
        where: { projectId },
      });

      if (!videoPreferences) {
        throw new NotFoundException('Video preferences not found for this project');
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
    const visualStyleData = VIDEO_PREFERENCE_OPTIONS.visual_style[selections.visualStyle]?.json_values || {};
    const lightingData = VIDEO_PREFERENCE_OPTIONS.lighting_mood[selections.lightingMood]?.json_values || {};
    const cameraData = VIDEO_PREFERENCE_OPTIONS.camera_style[selections.cameraStyle]?.json_values || {};
    const subjectData = VIDEO_PREFERENCE_OPTIONS.subject_focus[selections.subjectFocus]?.json_values || {};
    const locationData = VIDEO_PREFERENCE_OPTIONS.location_environment[selections.locationEnvironment]?.json_values || {};

    // Merge everything into final JSON structure
    return {
      shot: {
        composition: visualStyleData.composition || cameraData.shot_style || "medium shot",
        camera_motion: cameraData.camera_motion || "steady movement",
        frame_rate: cameraData.frame_rate || "30fps",
        film_grain: visualStyleData.film_grain || "natural digital tone",
      },
      subject: {
        description: `${subjectData.subject_description} for ${selections.userPrompt}`,
        wardrobe: subjectData.wardrobe || "contextual styling",
        action: subjectData.action || "appropriate expressive action",
      },
      scene: {
        location: locationData.location || "contextual location",
        time_of_day: lightingData.time_of_day || "appropriate lighting",
        environment: locationData.environment || lightingData.environment || "visually aligned environment",
      },
      audio: {
        ambient: locationData.ambient || "fitting ambient sounds",
        voice: {
          tone: lightingData.tone || "brand-appropriate",
          style: cameraData.voice_style || "clear delivery",
        },
      },
      visual_rules: {
        prohibited_elements: ["off-brand visuals", "clutter"],
      },
      brand_integration: {
        platform_name: "User Brand",
        visual_theme: visualStyleData.visual_theme || "creative branded",
        color_palette: visualStyleData.color_palette || ["primary brand color", "secondary color", "accent"],
        logo_appearance: "subtle integration",
      },
    };
  }


  async generateConceptWithPreferences(projectId: string, userId: string, authToken: string) {
    // Get video preferences
    const preferences = await this.prisma.userVideoPreferences.findFirst({
      where: { projectId }
    });

    if (!preferences) {
      throw new NotFoundException('Video preferences not found');
    }

    try {
      // 1. Get web info using your existing service
      this.logger.log(`Step 1/3: Getting web info for project ${projectId}`);
      const webInfoResponse = await axios.post(`${this.baseUrl}/get-web-info`, {
        prompt: preferences.userPrompt,
        projectId,
        userId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        timeout: 30000
      });

      // 2. Generate concept using your existing service with custom system prompt
      this.logger.log(`Step 2/3: Generating concept for project ${projectId}`);
      const conceptResponse = await axios.post(`${this.baseUrl}/concept-writer`, {
        prompt: this.buildVideoConceptPrompt(preferences, webInfoResponse.data),
        web_info: JSON.stringify(webInfoResponse.data),
        projectId,
        userId,
        model: 'gpt-5',
        system_prompt: this.buildVideoSystemPrompt(preferences)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        timeout: 60000
      });

      // 3. Generate story segments using the concept
      this.logger.log(`Step 3/3: Generating story segments for project ${projectId}`);
      const segmentationResponse = await axios.post(`${this.baseUrl}/segmentation`, {
        prompt: preferences.userPrompt,
        concept: conceptResponse.data.concepts[0].concept, // Use the generated concept
        projectId,
        userId,
        model: 'gpt-5',
        mode: 'story'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        timeout: 60000
      });

      this.logger.log(`Successfully completed all 3 steps for project ${projectId}`);

      return {
        success: true,
        data: {
          concept: conceptResponse.data.concepts[0],
          storySegments: segmentationResponse.data.segments,
          credits: segmentationResponse.data.credits
        }
      };

    } catch (error) {
      // Determine which step failed based on error context
      let failedStep = 'unknown';
      if (error.config?.url?.includes('/get-web-info')) {
        failedStep = 'Step 1/3: Web info generation';
      } else if (error.config?.url?.includes('/concept-writer')) {
        failedStep = 'Step 2/3: Concept generation';
      } else if (error.config?.url?.includes('/segmentation')) {
        failedStep = 'Step 3/3: Story segmentation';
      }

      this.logger.error(`Failed at ${failedStep} for project ${projectId}: ${error.message}`);
      throw new Error(`Failed to generate concept with preferences at ${failedStep}: ${error.message}`);
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
        throw new NotFoundException(`Segment with ID ${userVideoSegmentId} not found`);
      }

      // Ensure the user owns this segment
      if (existingSegment.project.userId !== userId) {
        throw new ForbiddenException(`You don't have access to update this segment`);
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
      this.logger.error(`Failed to update segment ${userVideoSegmentId}: ${error.message}`);
      throw error;
    }
  }



  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  async regenerateSegmentsWithWordLimit(
    segmentIds: string[],
    maxWords: number,
    userId: string,

  ) {
    const updatedSegments = [];

    for (const segmentId of segmentIds) {
      const segment = await this.prisma.userVideoSegment.findUnique({
        where: { id: segmentId },
      });

      if (!segment) continue;

      try {
        // 🔥 Direct GPT-5 call
        const completion = await this.openai.chat.completions.create({
          model: "gpt-5",
          messages: [
            {
              role: "system",
              content: `You are a helpful assistant. Regenerate the given video segment in under ${maxWords} words. Return ONLY plain text (no JSON, no markdown).`,
            },
            {
              role: "user",
              content: segment.description,
            },
          ],
        });

        const newContent =
          completion.choices[0]?.message?.content?.trim() || null;

        if (!newContent) {
          throw new Error("No content returned from GPT-5");
        }

        // Update DB with new segment
        const updatedSegment = await this.prisma.userVideoSegment.update({
          where: { id: segment.id },
          data: {
            description: newContent,
          },
        });

        updatedSegments.push(updatedSegment);
      } catch (err) {
        this.logger.error(
          `Failed to regenerate segment ${segmentId}: ${(err as Error).message}`,
        );
      }
    }

    return updatedSegments;
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
