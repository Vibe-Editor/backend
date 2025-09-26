import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { PromptOptimizerDto } from './dto/prompt-optimizer.dto';
import { VideoGenWithOptimizationDto } from './dto/video-gen-with-optimization.dto';
import { OptimizeAndGenerateVideoDto } from './dto/optimize-and-generate-video.dto';
import { CreditService } from '../credits/credit.service';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';

// Type definitions
export interface VideoResult {
  s3Keys: string[];
  model: string;
  totalVideos: number;
  videoUrl: string;
}

interface FalAiResponse {
  video: {
    url: string;
  };
}

@Injectable()
export class PromptOptimizerService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(PromptOptimizerService.name);
  private readonly prisma = new PrismaClient();

  constructor(private readonly creditService: CreditService) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set.');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async optimizePromptWithContext(dto: {
    jsonPrompt: string;
    description: string;
    userPreferences: string;
    segmentType: string;
    segmentDescription: string;
  }): Promise<{ optimizedPrompt: string }> {
    const { jsonPrompt, description, userPreferences, segmentType, segmentDescription } = dto;

    try {
      this.logger.log(`Starting prompt optimization for segment type: ${segmentType}`);

      const systemPrompt = `You are an expert prompt optimizer specializing in video content creation. Your task is to transform and optimize prompts for video generation based on story structure and narrative context.

You will receive:
1. A JSON prompt (as string) - the base visual prompt
2. A description of what the prompt should accomplish
3. User preferences for the optimization
4. Segment type - the narrative role this video plays in the story
5. Segment description - the specific story content for this segment

SEGMENT CONTEXT:
- Type: ${segmentType}
- Story Role: ${this.getSegmentRole(segmentType)}
- Content: ${segmentDescription}

Your job is to:
- Parse and understand the original JSON prompt
- Apply the description requirements to enhance the prompt
- Incorporate the user preferences to customize the output
- MOST IMPORTANTLY: Optimize for the specific narrative role (${segmentType})
- Ensure the visual style matches the story segment's emotional tone and purpose
- Return a well-structured, optimized prompt in JSON format

Focus on:
- Narrative consistency with the ${segmentType} story role
- Visual elements that support the story segment's purpose
- Emotional tone appropriate for ${segmentType}
- Cinematic techniques that enhance the narrative impact
- Maintaining proper JSON structure
- Incorporating user preferences while staying true to the story segment`;

      const userMessage = `Original JSON Prompt: ${jsonPrompt}

Description: ${description}

User Preferences: ${userPreferences}

Story Segment Type: ${segmentType}
Story Content: ${segmentDescription}

Please optimize this prompt for the ${segmentType} segment, ensuring it visually supports the narrative role and emotional tone. Return the optimized prompt as a properly formatted JSON string.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const optimizedPrompt = response.choices[0]?.message?.content;

      if (!optimizedPrompt) {
        throw new InternalServerErrorException(
          'Failed to generate optimized prompt',
        );
      }

      this.logger.log(`Prompt optimization completed for ${segmentType} segment`);

      return { optimizedPrompt };
    } catch (error) {
      this.logger.error('Error optimizing prompt with context:', error);
      throw new InternalServerErrorException(
        'Failed to optimize prompt: ' + (error as Error).message,
      );
    }
  }

  private getSegmentRole(segmentType: string): string {
    const roles = {
      setTheScene: 'Opening hook that establishes context and draws viewers in',
      ruinThings: 'Introduce conflict, problems, or challenges that create tension',
      theBreakingPoint: 'Peak moment of tension, climax, or critical turning point',
      cleanUpTheMess: 'Resolution begins, solutions emerge, hope returns',
      wrapItUp: 'Final conclusion, call-to-action, or satisfying ending',
    };
    return roles[segmentType] || 'Unknown segment role';
  }

  async optimizePrompt(
    promptOptimizerDto: PromptOptimizerDto,
  ): Promise<{ optimizedPrompt: string }> {
    const { jsonPrompt, description, userPreferences } = promptOptimizerDto;

    try {
      this.logger.log('Starting prompt optimization with GPT-4o');

      const systemPrompt = `You are an expert prompt optimizer. Your task is to transform and optimize prompts based on given requirements.

You will receive:
1. A JSON prompt (as string)
2. A description of what the prompt should accomplish
3. User preferences for the optimization

Your job is to:
- Parse and understand the original JSON prompt
- Apply the description requirements to enhance the prompt
- Incorporate the user preferences to customize the output
- Return a well-structured, optimized prompt in JSON format

The output should be a complete, ready-to-use prompt that maintains JSON structure while being optimized for the specific use case described.

Focus on:
- Clarity and specificity
- Incorporating the user's preferences
- Maintaining proper JSON structure
- Enhancing the prompt's effectiveness for its intended purpose`;

      const userMessage = `Original JSON Prompt: ${jsonPrompt}

Description: ${description}

User Preferences: ${userPreferences}

Please optimize this prompt according to the description and user preferences. Return the optimized prompt as a properly formatted JSON string.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const optimizedPrompt = response.choices[0]?.message?.content;

      if (!optimizedPrompt) {
        throw new InternalServerErrorException(
          'Failed to generate optimized prompt',
        );
      }

      this.logger.log('Prompt optimization completed successfully');

      return { optimizedPrompt };
    } catch (error) {
      this.logger.error('Error optimizing prompt:', error);
      throw new InternalServerErrorException(
        'Failed to optimize prompt: ' + (error as Error).message,
      );
    }
  }

  async generateVideoWithOptimizedPrompt(
    videoGenDto: VideoGenWithOptimizationDto,
    userId: string,
  ): Promise<{ videoResult: VideoResult }> {
    const { optimizedPrompt, segmentId, projectId } = videoGenDto;

    let creditTransactionId: string | null = null;

    try {
      // Step 1: Check and deduct credits for video generation
      this.logger.log(
        `Checking credits for veo3 text-to-video generation for user: ${userId}`,
      );

      const creditCheck = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_GENERATION',
        'veo3',
        false,
      );

      if (!creditCheck.hasEnoughCredits) {
        throw new InternalServerErrorException(
          `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance.toNumber()}`,
        );
      }

      // Deduct credits before video generation
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'VIDEO_GENERATION',
        'veo3',
        segmentId,
        false,
        `Text-to-video generation with optimized prompt for segment ${segmentId}`,
      );

      this.logger.log(
        `Successfully deducted ${creditCheck.requiredCredits} credits for veo3 text-to-video generation. Transaction ID: ${creditTransactionId}`,
      );

      // Step 2: Generate video using text-to-video approach
      this.logger.log(
        'Starting veo3 text-to-video generation with optimized prompt',
      );

      const videoResult = await this.generateTextToVideo(
        optimizedPrompt,
        segmentId,
        projectId,
      );

      this.logger.log('Veo3 text-to-video generation completed successfully');

      return {
        videoResult,
      };
    } catch (error) {
      this.logger.error('Error in generateVideoWithOptimizedPrompt:', error);

      // Refund credits if there was an error after deduction
      if (creditTransactionId) {
        try {
          this.logger.log(
            `Refunding credits due to video generation failure. Transaction ID: ${creditTransactionId}`,
          );

          await this.creditService.refundCredits(
            userId,
            'VIDEO_GENERATION',
            'veo3',
            segmentId,
            creditTransactionId,
            false,
            `Refund for failed text-to-video generation with optimized prompt - ${(error as Error).message}`,
          );

          this.logger.log('Credits refunded successfully');
        } catch (refundError) {
          this.logger.error('Failed to refund credits:', refundError);
          // Don't throw refund error, just log it
        }
      }

      throw new InternalServerErrorException(
        'Failed to generate video with optimized prompt: ' +
        (error as Error).message,
      );
    }
  }

  private async generateTextToVideo(
    prompt: string,
    segmentId: string,
    projectId: string,
  ): Promise<VideoResult> {
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable not set');
    }

    try {
      this.logger.log('Starting veo3 text-to-video generation with fal.ai');

      const response = await fetch('https://fal.run/fal-ai/veo3', {
        method: 'POST',
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          duration: '8s',
          aspect_ratio: '16:9',
          num_inference_steps: 25,
          guidance_scale: 3.5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Fal.ai API error: ${response.status} - ${errorText}`,
        );
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as FalAiResponse;
      this.logger.log(
        'Veo3 text-to-video generation completed, processing result',
      );

      if (!result.video?.url) {
        this.logger.error(
          'Veo3 text-to-video generation failed - no video URL returned',
        );
        throw new Error(
          'Veo3 text-to-video generation failed - no video URL returned',
        );
      }

      this.logger.log('Veo3 generated video, starting S3 upload');

      // Upload video to S3 (we need to import the S3 service)
      const { uploadVideoToS3 } = await import('../video-gen/s3/s3.service');
      const s3Key = await uploadVideoToS3(
        result.video.url,
        segmentId,
        projectId,
      );

      this.logger.log(
        `Successfully uploaded veo3 text-to-video to S3: ${s3Key}`,
      );

      return {
        s3Keys: [s3Key],
        model: 'veo3-text-to-video',
        totalVideos: 1,
        videoUrl: result.video.url,
      };
    } catch (error) {
      this.logger.error(
        `Veo3 text-to-video generation failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async optimizeAndGenerateVideo(
    dto: OptimizeAndGenerateVideoDto,
    userId: string,
  ): Promise<{ optimizedPrompt: string; s3Key: string; segmentId:string; description:string; }> {
    const { jsonPrompt, description, userPreferences, segmentId, projectId } =
      dto;

    let creditTransactionId: string | null = null;

    try {
      // Step 1: Get segment context for better optimization
      this.logger.log('Fetching segment context for optimization');
      const segment = await this.prisma.userVideoSegment.findUnique({
        where: { id: segmentId },
        select: { type: true, description: true, projectId: true },
      });

      if (!segment) {
        throw new InternalServerErrorException(`Segment ${segmentId} not found`);
      }

      this.logger.log(`Optimizing for segment type: ${segment.type}`);

      // Step 2: Optimize the prompt with segment context
      this.logger.log('Starting prompt optimization for video generation');
      const optimizationResult = await this.optimizePromptWithContext({
        jsonPrompt,
        description,
        userPreferences,
        segmentType: segment.type,
        segmentDescription: segment.description,
      });

      const optimizedPrompt = optimizationResult.optimizedPrompt;
      this.logger.log('Prompt optimization completed successfully');

      // Step 2: Check and deduct credits for video generation
      this.logger.log(
        `Checking credits for veo3 text-to-video generation for user: ${userId}`,
      );

      const creditCheck = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_GENERATION',
        'veo3',
        false,
      );

      if (!creditCheck.hasEnoughCredits) {
        throw new InternalServerErrorException(
          `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance.toNumber()}`,
        );
      }

      // Deduct credits before video generation
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'VIDEO_GENERATION',
        'veo3',
        segmentId,
        false,
        `Text-to-video generation with optimized prompt for segment ${segmentId}`,
      );

      this.logger.log(
        `Successfully deducted ${creditCheck.requiredCredits} credits for veo3 text-to-video generation. Transaction ID: ${creditTransactionId}`,
      );

      // Step 3: Generate video using text-to-video approach
      this.logger.log(
        'Starting veo3 text-to-video generation with optimized prompt',
      );

      const videoResult = await this.generateTextToVideo(
        optimizedPrompt,
        segmentId,
        projectId,
      );

      this.logger.log('Veo3 text-to-video generation completed successfully');

      // Step 4: Save to database
      await this.saveToDatabase({
        optimizedPrompt,
        s3Key: videoResult.s3Keys[0],
        segmentId,
        segmentType: segment.type,
        segmentDescription: segment.description,
        projectId,
        userId,
        videoResult,
        creditTransactionId,
        creditsUsed: creditCheck.requiredCredits,
      });

      // Move WORKFLOW_VIDEOS_GENERATED to top
      await this.updateWorkflowStep(dto.projectId, 'WORKFLOW_VIDEOS_GENERATED');

      return {
        optimizedPrompt,
        segmentId,
        description:segment.description,
        s3Key: videoResult.s3Keys[0], // Return the first (and only) S3 key
      };
    } catch (error) {
      this.logger.error('Error in optimizeAndGenerateVideo:', error);

      // Refund credits if there was an error after deduction
      if (creditTransactionId) {
        try {
          this.logger.log(
            `Refunding credits due to video generation failure. Transaction ID: ${creditTransactionId}`,
          );

          await this.creditService.refundCredits(
            userId,
            'VIDEO_GENERATION',
            'veo3',
            segmentId,
            creditTransactionId,
            false,
            `Refund for failed text-to-video generation with optimized prompt - ${(error as Error).message}`,
          );

          this.logger.log('Credits refunded successfully');
        } catch (refundError) {
          this.logger.error('Failed to refund credits:', refundError);
          // Don't throw refund error, just log it
        }
      }

      throw new InternalServerErrorException(
        'Failed to optimize prompt and generate video: ' +
        (error as Error).message,
      );
    }
  }

  // Add this helper method
  private async updateWorkflowStep(projectId: string, step: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { completedSteps: true }
    });

    const currentSteps = project?.completedSteps || [];
    const filteredSteps = currentSteps.filter(s => s !== step);
    const updatedSteps = [step, ...filteredSteps];

    await this.prisma.project.update({
      where: { id: projectId },
      data: { completedSteps: updatedSteps }
    });
  }


  private async saveToDatabase(params: {
    optimizedPrompt: string;
    s3Key: string;
    segmentId: string;
    segmentType: string;
    segmentDescription: string;
    projectId: string;
    userId: string;
    videoResult: VideoResult;
    creditTransactionId: string;
    creditsUsed: number;
  }): Promise<void> {
    const {
      optimizedPrompt,
      s3Key,
      segmentId,
      segmentType,
      segmentDescription,
      projectId,
      userId,
      videoResult,
      creditTransactionId,
      creditsUsed,
    } = params;

    try {
      this.logger.log(
        'Saving prompt optimization and video generation results to database',
      );

      // 1. Save SegmentResource with optimized prompt content and S3 key, linked to UserVideoSegment
      let parsedContent: Prisma.InputJsonValue;
      try {
        parsedContent = JSON.parse(optimizedPrompt) as Prisma.InputJsonValue;
      } catch {
        parsedContent = { prompt: optimizedPrompt };
      }

      const segmentResource = await this.prisma.segmentResource.create({
        data: {
          content: parsedContent, // Store the optimized JSON prompt
          s3Key: s3Key,
          segments: {
            connect: { id: segmentId }, // Link to the UserVideoSegment
          },
        },
      });

      this.logger.log(`Created SegmentResource with ID: ${segmentResource.id}`);

      // 2. Save GeneratedVideo record with segment type context
      const savedVideo = await this.prisma.generatedVideo.create({
        data: {
          animationPrompt: optimizedPrompt,
          artStyle: `${segmentType}-optimized-veo3`, // Include segment type in art style
          imageS3Key: '', // No image for text-to-video
          uuid: segmentId,
          success: true,
          model: videoResult.model || 'veo3-optimized',
          totalVideos: videoResult.totalVideos || 1,
          projectId,
          userId,
          creditTransactionId,
          creditsUsed: new Decimal(creditsUsed),
        },
      });

      this.logger.log(`Created GeneratedVideo with ID: ${savedVideo.id}`);

      // 3. Save GeneratedVideoFile records
      const savedVideoFiles = await Promise.all(
        videoResult.s3Keys.map(async (s3Key: string) => {
          return await this.prisma.generatedVideoFile.create({
            data: {
              s3Key,
              generatedVideoId: savedVideo.id,
            },
          });
        }),
      );

      this.logger.log(
        `Created ${savedVideoFiles.length} GeneratedVideoFile records`,
      );

      // 4. Save ConversationHistory with segment context
      await this.prisma.conversationHistory.create({
        data: {
          type: 'VIDEO_GENERATION',
          userInput: `Prompt optimization and video generation for ${segmentType} segment: ${segmentDescription.substring(0, 100)}...`,
          response: JSON.stringify({
            success: true,
            optimizedPrompt,
            s3Keys: videoResult.s3Keys,
            model: videoResult.model,
            totalVideos: videoResult.totalVideos,
            segmentType,
          }),
          metadata: {
            segmentId,
            segmentType,
            segmentDescription,
            segmentResourceId: segmentResource.id,
            savedVideoId: savedVideo.id,
            savedVideoFileIds: savedVideoFiles.map((f) => f.id),
            creditsUsed,
            operationType: 'PROMPT_OPTIMIZATION_VIDEO_GENERATION',
          },
          projectId,
          userId,
        },
      });

      this.logger.log(
        'Successfully saved all database records for prompt optimization and video generation',
      );
    } catch (error) {
      this.logger.error('Error saving to database:', error);
      throw new InternalServerErrorException(
        'Failed to save results to database: ' + (error as Error).message,
      );
    }
  }
}
