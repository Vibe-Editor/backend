import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { VideoGenerationResult } from '../video-gen.service';
import { Logger } from '@nestjs/common';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../s3/s3.service';
import RunwayML from '@runwayml/sdk';
import 'dotenv/config';

const logger = new Logger('RunwayML Agent');
const runwayClient = new RunwayML({ apiKey: process.env.RUNWAYML_API_KEY });

export const createRunwayMLAgent = () =>
  new Agent<{
    animation_prompt: string;
    art_style: string;
    imageS3Key: string;
    uuid: string;
  }>({
    name: 'RunwayML Realistic Video Agent',
    instructions:
      'You create realistic, high-quality videos using RunwayML Gen-3 Alpha Turbo model. Perfect for realistic content, human subjects, photorealistic scenes, and professional video generation.',
    tools: [
      tool({
        name: 'generate_runwayml_video',
        description:
          'Generate realistic/high-quality video using RunwayML Gen-3 Alpha Turbo model.',
        parameters: z.object({
          animation_prompt: z.string(),
          imageS3Key: z.string(),
          art_style: z.string(),
          uuid: z.string(),
        }) as any,
        execute: async ({ animation_prompt, art_style, imageS3Key, uuid }) => {
          //   logger.log(
          //     'Agent selected RunwayML for realistic/high-quality content',
          //   );
          return await generateRunwayMLVideo(
            animation_prompt,
            art_style,
            imageS3Key,
            uuid,
          );
        },
      }),
    ],
  });

async function generateRunwayMLVideo(
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  uuid: string,
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting RunwayML video generation for user: ${uuid}`);

  try {
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);

    // Create data URI for RunwayML
    const dataUri = `data:image/png;base64,${imageBase64}`;

    // Combine animation prompt with art style
    const combinedPrompt = `${animation_prompt}. Art style: ${art_style}`;

    const task = await runwayClient.imageToVideo
      .create({
        model: 'gen4_turbo',
        promptText: combinedPrompt,
        promptImage: dataUri,
        ratio: '1280:720',
        duration: 5,
      })
      .waitForTaskOutput({
        timeout: 10 * 60 * 1000, // 10 minutes timeout
      });

    if (!task.output || task.output.length === 0) {
      logger.error('RunwayML generation failed - no videos returned');
      throw new Error('RunwayML video generation failed - no videos returned');
    }
    const s3Keys = [];
    for (let i = 0; i < task.output.length; i++) {
      const videoUrl = task.output[i];
      logger.debug(`Processing video ${i + 1}/${task.output.length}:`, {
        hasUrl: !!videoUrl,
        url: videoUrl || 'null',
      });

      if (videoUrl) {
        try {
          logger.debug(
            `Uploading RunwayML video ${i + 1}/${task.output.length} to S3`,
          );
          const s3Key = await uploadVideoToS3(videoUrl, uuid);
          s3Keys.push(s3Key);
          logger.log(
            `Successfully uploaded RunwayML video ${i + 1} to S3: ${s3Key}`,
          );
        } catch (error) {
          logger.error(`Failed to upload RunwayML video ${i + 1}:`, {
            error: error.message,
            stack: error.stack,
            url: videoUrl,
            uuid,
          });

          throw new error();
        }
      } else {
        logger.warn(`Video ${i + 1} has no URL:`, task.output[i]);
      }
    }

    if (s3Keys.length === 0) {
      logger.error('Failed to upload any RunwayML videos to S3');
      throw new Error('Failed to upload any RunwayML videos to S3');
    }

    const totalTime = Date.now() - startTime;
    logger.log(
      `RunwayML video generation completed successfully in ${totalTime}ms`,
      {
        totalVideos: s3Keys.length,
        s3Keys,
        uuid,
      },
    );

    return {
      s3Keys,
      model: 'gen4_turbo',
      totalVideos: s3Keys.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`RunwayML video generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    throw error;
  }
}
