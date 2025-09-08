import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { VideoGenerationResult } from '../video-gen.service';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../s3/s3.service';
import 'dotenv/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('Veo3 Agent');

export const createVeo3Agent = () =>
  new Agent<{
    animation_prompt: string;
    art_style: string;
    imageS3Key: string;
    segmentId: string;
    projectId: string;
  }>({
    name: 'Veo3 High-Quality Video Agent',
    instructions:
      'You create high-quality, realistic videos using Veo3 model via Fal.ai. Perfect for professional content, realistic scenes, and high-end video generation.',
    tools: [
      tool({
        name: 'generate_veo3_video',
        description: 'Generate high-quality video using Veo3 model via Fal.ai.',
        parameters: z.object({
          animation_prompt: z.string(),
          imageS3Key: z.string(),
          art_style: z.string(),
          segmentId: z.string(),
          projectId: z.string(),
        }) as any,
        execute: async ({ animation_prompt, art_style, imageS3Key, segmentId, projectId }) => {
          return await generateVeo3Video(
            animation_prompt,
            art_style,
            imageS3Key,
            segmentId,
            projectId,
          );
        },
      }),
    ],
  });

async function generateVeo3Video(
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  segmentId: string,
  projectId: string,
): Promise<VideoGenerationResult> {
  
  logger.log(`Starting Veo3 video generation for user: ${segmentId}`);

  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY environment variable not set');
  }

  const additionalText = ` \n ART_STYLE: ${art_style}`;
  const maxAnimationPromptLength =
    2000 - additionalText.length - 'ANIMATION_PROMPT: '.length;

  if (animation_prompt.length > maxAnimationPromptLength) {
    logger.warn(
      `animation_prompt exceeded ${maxAnimationPromptLength} characters (${animation_prompt.length}), trimming to ${maxAnimationPromptLength} characters.`,
    );
    animation_prompt = animation_prompt
      .substring(0, maxAnimationPromptLength)
      .trim();
  }

  try {
    logger.log(`Fetching image from S3: ${imageS3Key}`);
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);
    logger.log(
      `Successfully converted image to base64 (${imageBase64.length} chars)`,
    );

    logger.log('Starting Veo3 video generation with Fal.ai');
    
    const prompt = `ANIMATION_PROMPT: ${animation_prompt} \n ART_STYLE: ${art_style}`;
    
    const response = await fetch('https://fal.run/fal-ai/veo3', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        image_url: `data:image/png;base64,${imageBase64}`,
        duration: 5,
        aspect_ratio: '16:9',
        num_inference_steps: 25,
        guidance_scale: 3.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Fal.ai API error: ${response.status} - ${errorText}`);
      throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    logger.log('Veo3 generation completed, processing result');

    if (!result.video || !result.video.url) {
      logger.error('Veo3 generation failed - no video URL returned');
      throw new Error('Veo3 video generation failed - no video URL returned');
    }

    logger.log(`Veo3 generated video, starting S3 upload`);
    
    const s3Key = await uploadVideoToS3(
      result.video.url,
      segmentId,
      projectId,
    );

    logger.log(`Successfully uploaded Veo3 video to S3: ${s3Key}`);

    return {
      s3Keys: [s3Key],
      model: 'veo3',
      totalVideos: 1,
    };
  } catch (error) {
    logger.error(`Veo3 video generation failed: ${error.message}`);
    throw error;
  }
}
