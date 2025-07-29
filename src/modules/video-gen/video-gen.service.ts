import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { VideoGenDto } from './dto/video-gen.dto';
import { UpdateVideoGenDto } from './dto/update-video-gen.dto';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Agent, handoff, run } from '@openai/agents';
import { z } from 'zod';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { createVeo2Agent } from './agents/veo2.agent';
import { createRunwayMLAgent } from './agents/runwayml.agent';
import { createKlingAgent } from './agents/kling.agent';
import { CreditService } from '../credits/credit.service';

export interface VideoGenerationResult {
  s3Keys: string[];
  model: string;
  totalVideos: number;
}

@Injectable()
export class VideoGenService {
  private readonly logger = new Logger(VideoGenService.name);
  private readonly genAI: GoogleGenAI;
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable not set.');
      }
      if (!process.env.RUNWAYML_API_KEY) {
        throw new Error('RUNWAYML_API_KEY environment variable not set.');
      }
      if (
        !process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY ||
        !process.env.AWS_REGION
      ) {
        throw new Error('AWS credentials environment variables not set.');
      }
      if (!process.env.S3_BUCKET_NAME) {
        throw new Error('S3_BUCKET_NAME environment variable not set.');
      }

      this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      this.logger.log(
        'Google AI, RunwayML, and S3 clients configured successfully',
      );
    } catch (error) {
      this.logger.error('Failed to initialize VideoGenService', error.stack);
      throw error;
    }
  }

  async generateVideo(videoGenDto: VideoGenDto, userId: string) {
    // Use projectId from body - no fallback project creation logic
    const { animation_prompt, art_style, imageS3Key, uuid, projectId } =
      videoGenDto;
    this.logger.log(`Using project ${projectId} for video generation`);

    const startTime = Date.now();
    this.logger.log(`Starting video generation request for user: ${uuid}`);

    const Veo2Agent = createVeo2Agent();
    const RunwayMLAgent = createRunwayMLAgent();
    const KlingAgent = createKlingAgent();

    const triageAgent = Agent.create({
      name: 'Video Generation Triage Agent',
      model: 'gpt-4o-mini',
      instructions: `
      You are a video generation assistant that decides which model to use based on the prompt.
      
      Use Veo2 for:
      - Cartoonish, animated, or stylized content
      - 2D/3D animations
      - Artistic or abstract visuals
      - Non-realistic creative content
      - Experimental or artistic styles
      
      Use RunwayML for:
      - Realistic, photographic content
      - Human subjects and real-world scenes
      - Professional video content
      - High-quality cinematic videos
      - Documentary-style content
      - Photorealistic animations
      - Commercial or marketing videos
      
      Analyze the prompt and choose the appropriate model, then hand off to the corresponding agent.`,
      handoffs: [
        handoff(Veo2Agent, {
          toolNameOverride: 'use_veo2_agent',
          toolDescriptionOverride:
            'Send to Veo2 agent for cartoonish/animated content.',
        }),
        handoff(RunwayMLAgent, {
          toolNameOverride: 'use_runwayml_agent',
          toolDescriptionOverride:
            'Send to RunwayML agent for realistic/high-quality content.',
        }),
        handoff(KlingAgent, {
          toolNameOverride: 'use_kling_agent',
          toolDescriptionOverride:
            'Send to Kling agent for cinematic/fluid content.',
        }),
      ],
    });

    try {
      if (!animation_prompt || !imageS3Key || !uuid) {
        this.logger.error('Missing required fields in request', {
          hasPrompt: !!animation_prompt,
          hasImageS3Key: !!imageS3Key,
          hasUuid: !!uuid,
        });
        throw new BadRequestException(
          'Missing required fields: animation_prompt, imageS3Key, and uuid are required',
        );
      }

      // ===== CREDIT SYSTEM INTEGRATION =====
      this.logger.log(
        `Checking user credits before video generation [${uuid}]`,
      );

      // Check credits for all video models and use worst case (highest cost) for validation
      const veo2Check = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_GENERATION',
        'veo2',
        false,
      );

      const runwaymlCheck = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_GENERATION',
        'runwayml',
        false,
      );

      const klingCheck = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_GENERATION',
        'kling',
        false,
      );

      // Use the highest cost for validation (veo2 = 25 credits is most expensive)
      const creditCheck = veo2Check; // veo2 has highest cost at 25 credits

      if (!creditCheck.hasEnoughCredits) {
        this.logger.error(
          `Insufficient credits for user ${userId}. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance} [${uuid}]`,
        );
        throw new BadRequestException(
          `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance}`,
        );
      }

      this.logger.log(
        `Credit validation passed. User ${userId} has ${creditCheck.currentBalance} credits available [${uuid}]`,
      );
      // ===== END CREDIT VALIDATION =====

      this.logger.log('Running triage agent to determine model selection');
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `Generate a video with prompt: "${animation_prompt}"\n art style: "${art_style}"\n using image S3 key: "${imageS3Key}"\n for user: "${uuid}"`,
        },
      ]);

      this.logger.debug('Agent execution completed, parsing result');
      console.log(result.output);

      try {
        this.logger.log('Using Gemini to parse agent result');
        const geminiParseRes = await this.genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: `Parse this entire agent conversation output and extract the video generation result. Return a JSON object with "s3Keys" (array of strings), "model" (string), and "totalVideos" (number).

          Full agent output:
          ${JSON.stringify(result.output, null, 2)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                s3Keys: {
                  type: 'array',
                  items: { type: 'string' },
                },
                model: { type: 'string' },
                totalVideos: { type: 'number' },
              },
              required: ['s3Keys', 'model', 'totalVideos'],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);
        this.logger.debug('Parsed agent result:', agentResult);

        if (
          agentResult?.s3Keys &&
          agentResult?.model &&
          agentResult.s3Keys.length > 0
        ) {
          const totalTime = Date.now() - startTime;
          this.logger.log(
            `Video generation completed successfully in ${totalTime}ms`,
            {
              model: agentResult.model,
              totalVideos: agentResult.totalVideos,
              s3Keys: agentResult.s3Keys,
              uuid: uuid,
            },
          );

          // ===== CREDIT DEDUCTION =====
          this.logger.log(
            `Deducting credits for successful video generation [${uuid}]`,
          );

          let creditTransactionId: string;
          let actualCreditsUsed: number;

          try {
            // Determine the model used from the agent result
            let modelUsed = 'veo2'; // default fallback
            if (
              agentResult.model.toLowerCase().includes('runwayml') ||
              agentResult.model.toLowerCase().includes('runway')
            ) {
              modelUsed = 'runwayml';
            } else if (agentResult.model.toLowerCase().includes('kling')) {
              modelUsed = 'kling';
            } else if (
              agentResult.model.toLowerCase().includes('veo2') ||
              agentResult.model.toLowerCase().includes('veo')
            ) {
              modelUsed = 'veo2';
            }

            // Set actual credits used based on model
            if (modelUsed === 'veo2') {
              actualCreditsUsed = 25;
            } else if (modelUsed === 'runwayml') {
              actualCreditsUsed = 2.5;
            } else if (modelUsed === 'kling') {
              actualCreditsUsed = 20;
            } else {
              actualCreditsUsed = 25; // fallback to veo2 pricing
            }

            // Deduct credits for the actual model used
            creditTransactionId = await this.creditService.deductCredits(
              userId,
              'VIDEO_GENERATION',
              modelUsed,
              uuid, // using uuid as operationId
              false, // isEditCall - we'll handle edit calls in a separate endpoint later
              `Video generation using ${modelUsed} model`,
            );

            this.logger.log(
              `Successfully deducted ${actualCreditsUsed} credits for ${modelUsed}. Transaction ID: ${creditTransactionId} [${uuid}]`,
            );
          } catch (creditError) {
            this.logger.error(
              `Failed to deduct credits after successful video generation [${uuid}]:`,
              creditError,
            );
            // Note: We still continue and save the video since generation was successful
            // The credit transaction can be handled manually if needed
            creditTransactionId = null;
            actualCreditsUsed = 0;
          }
          // ===== END CREDIT DEDUCTION =====

          this.logger.log(`Saving video generation to database`);
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: imageS3Key,
              uuid: uuid,
              success: true,
              model: agentResult.model,
              totalVideos: agentResult.totalVideos,
              projectId,
              userId,
              // Add credit tracking
              creditTransactionId: creditTransactionId,
              creditsUsed:
                actualCreditsUsed > 0 ? new Decimal(actualCreditsUsed) : null, // Store the actual credits used
            },
          });

          const savedVideoFiles = await Promise.all(
            agentResult.s3Keys.map(async (s3Key: string) => {
              return await this.prisma.generatedVideoFile.create({
                data: {
                  s3Key,
                  generatedVideoId: savedVideo.id,
                },
              });
            }),
          );

          await this.prisma.conversationHistory.create({
            data: {
              type: 'VIDEO_GENERATION',
              userInput: animation_prompt,
              response: JSON.stringify({
                success: true,
                s3Keys: agentResult.s3Keys,
                model: agentResult.model,
                totalVideos: agentResult.totalVideos,
              }),
              metadata: {
                artStyle: art_style,
                imageS3Key: imageS3Key,
                uuid: uuid,
                savedVideoId: savedVideo.id,
                savedVideoFileIds: savedVideoFiles.map((f) => f.id),
              },
              projectId,
              userId,
            },
          });

          this.logger.log(
            `Successfully saved video generation: ${savedVideo.id} with ${savedVideoFiles.length} files`,
          );

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            success: true,
            s3Keys: agentResult.s3Keys,
            model: agentResult.model,
            totalVideos: agentResult.totalVideos,
            credits: {
              used: actualCreditsUsed,
              balance: newBalance.toNumber(),
            },
          };
        } else {
          this.logger.error(
            'Agent produced result but no videos were successfully uploaded',
            {
              agentResult,
              hasS3Keys: !!agentResult?.s3Keys,
              s3KeysLength: agentResult?.s3Keys?.length || 0,
              hasModel: !!agentResult?.model,
            },
          );
          throw new InternalServerErrorException(
            'Video generation completed but no videos were successfully uploaded to S3.',
          );
        }
      } catch (parseError) {
        this.logger.error(
          'Failed to parse agent result with Gemini:',
          parseError,
        );
      }

      throw new InternalServerErrorException(
        'Agent did not produce a valid video generation result.',
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Video generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid: uuid,
        stack: error.stack,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        error.message?.includes('quota') ||
        error.message?.includes('limit')
      ) {
        throw new InternalServerErrorException(
          'API quota exceeded. Please try again later.',
        );
      }

      if (
        error.message?.includes('unauthorized') ||
        error.message?.includes('authentication')
      ) {
        throw new InternalServerErrorException(
          'API authentication failed. Please contact support.',
        );
      }

      throw new InternalServerErrorException(
        'Failed to generate video. Please try again later.',
      );
    }
  }

  /**
   * Get all generated videos for a user, optionally filtered by project
   */
  async getAllVideos(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const videos = await this.prisma.generatedVideo.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          videoFiles: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      this.logger.log(
        `Retrieved ${videos.length} generated videos for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: videos.length,
        videos,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve videos: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve videos: ${error.message}`,
      );
    }
  }

  /**
   * Get a specific generated video by ID for a user
   */
  async getVideoById(videoId: string, userId: string) {
    try {
      const video = await this.prisma.generatedVideo.findFirst({
        where: {
          id: videoId,
          userId, // Ensure user can only access their own videos
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          videoFiles: true,
        },
      });

      if (!video) {
        throw new NotFoundException(
          `Generated video with ID ${videoId} not found or you don't have access to it`,
        );
      }

      this.logger.log(
        `Retrieved generated video ${videoId} for user ${userId}`,
      );

      return {
        success: true,
        video,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve video ${videoId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve video: ${error.message}`,
      );
    }
  }

  /**
   * Update the animation prompt, art style, input imageS3Key, output video S3 keys, and/or project of a specific generated video
   */
  async updateVideoPrompt(
    videoId: string,
    updateData: UpdateVideoGenDto,
    userId: string,
  ) {
    try {
      // First, verify the video exists and belongs to the user
      const existingVideo = await this.prisma.generatedVideo.findFirst({
        where: { id: videoId, userId },
        include: {
          project: { select: { id: true, name: true } },
          videoFiles: true,
        },
      });

      if (!existingVideo) {
        throw new NotFoundException(
          `Generated video with ID ${videoId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {
        animationPrompt: updateData.animation_prompt,
        artStyle: updateData.art_style,
      };

      if (updateData.image_s3_key !== undefined) {
        updateFields.imageS3Key = updateData.image_s3_key;
      }
      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      // Begin database transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Update the video gen record
        const updatedVideo = await tx.generatedVideo.update({
          where: { id: videoId },
          data: updateFields,
        });

        // Handle video file updates if new S3 keys provided
        if (updateData.video_s3_keys && updateData.video_s3_keys.length > 0) {
          // Delete existing video files
          await tx.generatedVideoFile.deleteMany({
            where: { generatedVideoId: videoId },
          });

          // Create new video files
          await tx.generatedVideoFile.createMany({
            data: updateData.video_s3_keys.map((s3Key) => ({
              generatedVideoId: videoId,
              s3Key,
            })),
          });
        }

        // Update project timestamp to ensure fresh data
        if (existingVideo.projectId) {
          await tx.project.update({
            where: { id: existingVideo.projectId },
            data: { updatedAt: new Date() },
          });
        }

        return updatedVideo;
      });

      const finalUpdatedVideo = await this.prisma.generatedVideo.findUnique({
        where: { id: videoId },
        include: {
          project: { select: { id: true, name: true } },
          videoFiles: { orderBy: { createdAt: 'desc' } },
        },
      });

      // Log the update in conversation history
      if (existingVideo.projectId) {
        await this.prisma.conversationHistory.create({
          data: {
            type: 'VIDEO_GENERATION',
            userInput: JSON.stringify({
              action: 'update_video',
              videoId,
              newPrompt: updateData.animation_prompt,
              oldPrompt: existingVideo.animationPrompt,
              newArtStyle: updateData.art_style,
              oldArtStyle: existingVideo.artStyle,
              updatedFields: updateFields,
            }),
            response: JSON.stringify({
              success: true,
              message: 'Video updated successfully',
              updatedFields: Object.keys(updateFields),
            }),
            metadata: {
              action: 'update',
              videoId,
              updatedFields: Object.keys(updateFields),
            },
            projectId: finalUpdatedVideo.projectId,
            userId,
          },
        });
      }

      this.logger.log(
        `Updated video ${videoId} for user ${userId}: ${Object.keys(updateFields).join(', ')} - Final video has ${finalUpdatedVideo.videoFiles.length} files`,
      );

      return {
        success: true,
        message: 'Video updated successfully',
        video: finalUpdatedVideo,
      };
    } catch (error) {
      this.logger.error(`Failed to update video ${videoId}: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to update video: ${error.message}`,
      );
    }
  }
}
