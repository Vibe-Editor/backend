import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { VideoGenerationResult } from '../video-gen.service';
import { Logger } from '@nestjs/common';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../s3/s3.service';
import { fal } from '@fal-ai/client';
import 'dotenv/config';

const logger = new Logger('Kling Agent');

export const createKlingAgent = () =>
  new Agent<{
    animation_prompt: string;
    art_style: string;
    imageS3Key: string;
    segmentId: string;
    projectId: string;
  }>({
    name: 'Kling 2.1 Master Video Agent',
    instructions:
      'You create cinematic, fluid, and visually stunning videos using Kling 2.1 Master. Ideal for top-tier motion, creative storytelling, and prompt precision.',
    tools: [
      tool({
        name: 'generate_kling_video',
        description:
          'Generate cinematic video using Kling 2.1 Master (fal.ai).',
        parameters: z.object({
          animation_prompt: z.string(),
          imageS3Key: z.string(),
          art_style: z.string(),
          segmentId: z.string(),
          projectId: z.string(),
        }) as any,
        execute: async ({
          animation_prompt,
          art_style,
          imageS3Key,
          segmentId,
          projectId,
        }) => {
          logger.log('Agent selected Kling 2.1 Master for cinematic content');
          return await generateKlingVideo(
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

async function generateKlingVideo(
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  segmentId: string,
  projectId: string,
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Kling video generation for user: ${segmentId}`);

  // Trim animation_prompt to ensure total prompt length stays reasonable (under 1500 characters for Kling)
  const additionalText = `. Art style: ${art_style}`;
  const maxAnimationPromptLength = 1500 - additionalText.length;

  if (animation_prompt.length > maxAnimationPromptLength) {
    logger.warn(
      `animation_prompt exceeded ${maxAnimationPromptLength} characters (${animation_prompt.length}), trimming to ${maxAnimationPromptLength} characters.`,
    );
    animation_prompt = animation_prompt
      .substring(0, maxAnimationPromptLength)
      .trim();
  }

  try {
    // Get image from S3 as base64 and convert to data URI
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);
    const dataUri = `data:image/png;base64,${imageBase64}`;

    // Combine prompt and art style
    const combinedPrompt = `${animation_prompt}. Art style: ${art_style}`;

    // Call fal.ai Kling 2.1 Master API
    const result = await fal.subscribe(
      'fal-ai/kling-video/v2.1/master/image-to-video',
      {
        input: {
          prompt: combinedPrompt,
          image_url: dataUri,
          duration: '5', // default duration
          negative_prompt: 'blur, distort, and low quality',
          cfg_scale: 0.5,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs
              ?.map((log) => log.message)
              .forEach((msg) => logger.debug(msg));
          }
        },
      },
    );

    if (!result?.data?.video?.url) {
      logger.error('Kling generation failed - no video URL returned');
      throw new Error('Kling video generation failed - no video URL returned');
    }

    // Upload video to S3
    logger.debug('Uploading Kling video to S3');
    const s3Key = await uploadVideoToS3(
      result.data.video.url,
      segmentId,
      projectId,
    );
    logger.log(`Successfully uploaded Kling video to S3: ${s3Key}`);

    const totalTime = Date.now() - startTime;
    logger.log(
      `Kling video generation completed successfully in ${totalTime}ms`,
      {
        s3Key,
        segmentId,
      },
    );

    return {
      s3Keys: [s3Key],
      model: 'kling-v2.1-master',
      totalVideos: 1,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Kling video generation failed after ${totalTime}ms`, {
      error: error.message,
      segmentId,
      stack: error.stack,
    });
    throw error;
  }
}
