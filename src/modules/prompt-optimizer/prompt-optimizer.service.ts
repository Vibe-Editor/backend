import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import { PromptOptimizerDto } from './dto/prompt-optimizer.dto';
import { VideoGenWithOptimizationDto } from './dto/video-gen-with-optimization.dto';
import { OptimizeAndGenerateVideoDto } from './dto/optimize-and-generate-video.dto';
import { CreditService } from '../credits/credit.service';
import { createVeo3Agent } from '../video-gen/agents/veo3.agent';
import { run } from '@openai/agents';

@Injectable()
export class PromptOptimizerService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(PromptOptimizerService.name);

  constructor(private readonly creditService: CreditService) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set.');
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async optimizePrompt(promptOptimizerDto: PromptOptimizerDto): Promise<{ optimizedPrompt: string }> {
    const { jsonPrompt, description, userPreferences } = promptOptimizerDto;

    try {
      this.logger.log('Starting prompt optimization with GPT-5');

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
        model: 'gpt-4o', // Using GPT-4o as GPT-5 may not be available yet
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const optimizedPrompt = response.choices[0]?.message?.content;

      if (!optimizedPrompt) {
        throw new InternalServerErrorException('Failed to generate optimized prompt');
      }

      this.logger.log('Prompt optimization completed successfully');

      return { optimizedPrompt };
    } catch (error) {
      this.logger.error('Error optimizing prompt:', error);
      throw new InternalServerErrorException('Failed to optimize prompt: ' + error.message);
    }
  }

  async generateVideoWithOptimizedPrompt(
    videoGenDto: VideoGenWithOptimizationDto,
    userId: string,
  ): Promise<{ videoResult: any }> {
    const { 
      optimizedPrompt, 
      segmentId, 
      projectId 
    } = videoGenDto;

    let creditTransactionId: string | null = null;

    try {
      // Step 1: Check and deduct credits for video generation
      // this.logger.log(`Checking credits for veo3 text-to-video generation for user: ${userId}`);
      
      // const creditCheck = await this.creditService.checkUserCredits(
      //   userId,
      //   'VIDEO_GENERATION',
      //   'veo3',
      //   false,
      // );

      // if (!creditCheck.hasEnoughCredits) {
      //   throw new InternalServerErrorException(
      //     `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance.toNumber()}`,
      //   );
      // }

      // // Deduct credits before video generation
      // creditTransactionId = await this.creditService.deductCredits(
      //   userId,
      //   'VIDEO_GENERATION',
      //   'veo3',
      //   segmentId,
      //   false,
      //   `Text-to-video generation with optimized prompt for segment ${segmentId}`,
      // );

      // this.logger.log(
      //   `Successfully deducted ${creditCheck.requiredCredits} credits for veo3 text-to-video generation. Transaction ID: ${creditTransactionId}`,
      // );

      // // Step 2: Generate video using text-to-video approach
      // this.logger.log('Starting veo3 text-to-video generation with optimized prompt');
      
      const videoResult = await this.generateTextToVideo(optimizedPrompt, segmentId, projectId);

      this.logger.log('Veo3 text-to-video generation completed successfully');

      return {
        videoResult,
      };

    } catch (error) {
      this.logger.error('Error in generateVideoWithOptimizedPrompt:', error);

      // Refund credits if there was an error after deduction
      if (creditTransactionId) {
        try {
          this.logger.log(`Refunding credits due to video generation failure. Transaction ID: ${creditTransactionId}`);
          
          await this.creditService.refundCredits(
            userId,
            'VIDEO_GENERATION',
            'veo3',
            segmentId,
            creditTransactionId,
            false,
            `Refund for failed text-to-video generation with optimized prompt - ${error.message}`,
          );

          this.logger.log('Credits refunded successfully');
        } catch (refundError) {
          this.logger.error('Failed to refund credits:', refundError);
          // Don't throw refund error, just log it
        }
      }

      throw new InternalServerErrorException(
        'Failed to generate video with optimized prompt: ' + error.message,
      );
    }
  }

  private async generateTextToVideo(
    prompt: string,
    segmentId: string,
    projectId: string,
  ): Promise<any> {
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
        this.logger.error(`Fal.ai API error: ${response.status} - ${errorText}`);
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      this.logger.log('Veo3 text-to-video generation completed, processing result');

      if (!result.video || !result.video.url) {
        this.logger.error('Veo3 text-to-video generation failed - no video URL returned');
        throw new Error('Veo3 text-to-video generation failed - no video URL returned');
      }

      this.logger.log('Veo3 generated video, starting S3 upload');

      // Upload video to S3 (we need to import the S3 service)
      const { uploadVideoToS3 } = await import('../video-gen/s3/s3.service');
      const s3Key = await uploadVideoToS3(result.video.url, segmentId, projectId);

      this.logger.log(`Successfully uploaded veo3 text-to-video to S3: ${s3Key}`);

      return {
        s3Keys: [s3Key],
        model: 'veo3-text-to-video',
        totalVideos: 1,
        videoUrl: result.video.url,
      };

    } catch (error) {
      this.logger.error(`Veo3 text-to-video generation failed: ${error.message}`);
      throw error;
    }
  }

  async optimizeAndGenerateVideo(
    dto: OptimizeAndGenerateVideoDto,
    userId: string,
  ): Promise<{ optimizedPrompt: string; s3Key: string }> {
    const { 
      jsonPrompt, 
      description, 
      userPreferences,
      segmentId, 
      projectId 
    } = dto;

    let creditTransactionId: string | null = null;

    try {
      // Step 1: Optimize the prompt
      this.logger.log('Starting prompt optimization for video generation');
      const optimizationResult = await this.optimizePrompt({
        jsonPrompt,
        description,
        userPreferences,
      });

      const optimizedPrompt = optimizationResult.optimizedPrompt;
      this.logger.log('Prompt optimization completed successfully');

      // Step 2: Check and deduct credits for video generation
      // this.logger.log(`Checking credits for veo3 text-to-video generation for user: ${userId}`);
      
      // const creditCheck = await this.creditService.checkUserCredits(
      //   userId,
      //   'VIDEO_GENERATION',
      //   'veo3',
      //   false,
      // );

      // if (!creditCheck.hasEnoughCredits) {
      //   throw new InternalServerErrorException(
      //     `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance.toNumber()}`,
      //   );
      // }

      // // Deduct credits before video generation
      // creditTransactionId = await this.creditService.deductCredits(
      //   userId,
      //   'VIDEO_GENERATION',
      //   'veo3',
      //   segmentId,
      //   false,
      //   `Text-to-video generation with optimized prompt for segment ${segmentId}`,
      // );

      // this.logger.log(
      //   `Successfully deducted ${creditCheck.requiredCredits} credits for veo3 text-to-video generation. Transaction ID: ${creditTransactionId}`,
      // );

      // Step 3: Generate video using text-to-video approach
      this.logger.log('Starting veo3 text-to-video generation with optimized prompt');
      
      const videoResult = await this.generateTextToVideo(optimizedPrompt, segmentId, projectId);

      this.logger.log('Veo3 text-to-video generation completed successfully');

      return {
        optimizedPrompt,
        s3Key: videoResult.s3Keys[0], // Return the first (and only) S3 key
      };

    } catch (error) {
      this.logger.error('Error in optimizeAndGenerateVideo:', error);

      // Refund credits if there was an error after deduction
      // if (creditTransactionId) {
      //   try {
      //     this.logger.log(`Refunding credits due to video generation failure. Transaction ID: ${creditTransactionId}`);
          
      //     await this.creditService.refundCredits(
      //       userId,
      //       'VIDEO_GENERATION',
      //       'veo3',
      //       segmentId,
      //       creditTransactionId,
      //       false,
      //       `Refund for failed text-to-video generation with optimized prompt - ${error.message}`,
      //     );

      //     this.logger.log('Credits refunded successfully');
      //   } catch (refundError) {
      //     this.logger.error('Failed to refund credits:', refundError);
      //     // Don't throw refund error, just log it
      //   }
      // }

      throw new InternalServerErrorException(
        'Failed to optimize prompt and generate video: ' + error.message,
      );
    }
  }
}

