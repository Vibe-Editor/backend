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
    segmentId: string;
    projectId: string;
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
          segmentId: z.string(),
          projectId: z.string(),
        }) as any,
        execute: async ({ animation_prompt, art_style, imageS3Key, segmentId, projectId }) => {
          logger.log(
            'Agent selected RunwayML for realistic/high-quality content',
          );
          return await generateRunwayMLVideo(
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

async function generateRunwayMLVideo(
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  segmentId: string,
  projectId: string,
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting RunwayML video generation for user: ${segmentId}`);

  // Trim animation_prompt to ensure total prompt length stays well under 1000 characters (using 950 for safety buffer)
  const additionalText = `. Art style: ${art_style}`;
  const maxAnimationPromptLength = 950 - additionalText.length;

  logger.debug(`Initial animation_prompt length: ${animation_prompt.length}`);
  logger.debug(`Additional text length: ${additionalText.length}`);
  logger.debug(
    `Max allowed animation_prompt length: ${maxAnimationPromptLength}`,
  );
  logger.debug(`Art style: "${art_style}" (${art_style.length} chars)`);

  if (animation_prompt.length > maxAnimationPromptLength) {
    logger.warn(
      `animation_prompt exceeded ${maxAnimationPromptLength} characters (${animation_prompt.length}), trimming to ${maxAnimationPromptLength} characters.`,
    );
    animation_prompt = animation_prompt
      .substring(0, maxAnimationPromptLength)
      .trim();
    logger.debug(`Trimmed animation_prompt length: ${animation_prompt.length}`);
  }

  try {
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);

    // Create data URI for RunwayML
    const dataUri = `data:image/png;base64,${imageBase64}`;

    // Combine animation prompt with art style
    let combinedPrompt = `${animation_prompt}. Art style: ${art_style}`;

    // Debug logging to verify prompt length
    logger.debug(`Final prompt length: ${combinedPrompt.length} characters`);

    // Additional safety check - ensure final prompt doesn't exceed 950 characters (with safety buffer)
    if (combinedPrompt.length > 950) {
      logger.error(
        `Final prompt still exceeds 950 characters (${combinedPrompt.length}). Applying emergency trim.`,
      );
      combinedPrompt = combinedPrompt.substring(0, 950).trim();
      logger.warn(
        `Emergency trimmed prompt to ${combinedPrompt.length} characters`,
      );
    }

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
          const s3Key = await uploadVideoToS3(videoUrl, segmentId, projectId);
          s3Keys.push(s3Key);
          logger.log(
            `Successfully uploaded RunwayML video ${i + 1} to S3: ${s3Key}`,
          );
        } catch (error) {
          logger.error(`Failed to upload RunwayML video ${i + 1}:`, {
            error: error.message,
            stack: error.stack,
            url: videoUrl,
            segmentId,
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
        segmentId,
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
      segmentId,
      stack: error.stack,
    });
    throw error;
  }
}
