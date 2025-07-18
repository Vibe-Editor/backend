import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { VideoGenDto } from './dto/video-gen.dto';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Agent, handoff, run } from '@openai/agents';
import { z } from 'zod';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { createVeo2Agent } from './agents/veo2.agent';
import { createRunwayMLAgent } from './agents/runwayml.agent';
import { createKlingAgent } from './agents/kling.agent';

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

  constructor(private readonly projectHelperService: ProjectHelperService) {
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
    // Ensure user has a project (create default if none exists)
    const projectId =
      await this.projectHelperService.ensureUserHasProject(userId);
    this.logger.log(`Using project ${projectId} for video generation`);

    const startTime = Date.now();
    this.logger.log(
      `Starting video generation request for user: ${videoGenDto.uuid}`,
    );

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
      if (
        !videoGenDto.animation_prompt ||
        !videoGenDto.imageS3Key ||
        !videoGenDto.uuid
      ) {
        this.logger.error('Missing required fields in request', {
          hasPrompt: !!videoGenDto.animation_prompt,
          hasImageS3Key: !!videoGenDto.imageS3Key,
          hasUuid: !!videoGenDto.uuid,
        });
        throw new BadRequestException(
          'Missing required fields: animation_prompt, imageS3Key, and uuid are required',
        );
      }

      this.logger.log('Running triage agent to determine model selection');
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `Generate a video with prompt: "${videoGenDto.animation_prompt}"\n art style: "${videoGenDto.art_style}"\n using image S3 key: "${videoGenDto.imageS3Key}"\n for user: "${videoGenDto.uuid}"`,
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
              uuid: videoGenDto.uuid,
            },
          );

          this.logger.log(`Saving video generation to database`);
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: videoGenDto.animation_prompt,
              artStyle: videoGenDto.art_style,
              imageS3Key: videoGenDto.imageS3Key,
              uuid: videoGenDto.uuid,
              success: true,
              model: agentResult.model,
              totalVideos: agentResult.totalVideos,
              projectId,
              userId,
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
              userInput: videoGenDto.animation_prompt,
              response: JSON.stringify({
                success: true,
                s3Keys: agentResult.s3Keys,
                model: agentResult.model,
                totalVideos: agentResult.totalVideos,
              }),
              metadata: {
                artStyle: videoGenDto.art_style,
                imageS3Key: videoGenDto.imageS3Key,
                uuid: videoGenDto.uuid,
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

          return {
            success: true,
            s3Keys: agentResult.s3Keys,
            model: agentResult.model,
            totalVideos: agentResult.totalVideos,
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
        uuid: videoGenDto.uuid,
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
}
