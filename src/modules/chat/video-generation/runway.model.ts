import { Logger } from '@nestjs/common';
import {
  getImageFromS3AsBase64,
  uploadVideoToS3,
} from '../../video-gen/s3/s3.service';
import RunwayML from '@runwayml/sdk';

const logger = new Logger('RunwayML Model');
const runwayClient = new RunwayML({ apiKey: process.env.RUNWAYML_API_KEY });

export async function runwayVideoGen(
  uuid: string,
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
) {
  const startTime = Date.now();
  logger.log(`Starting RunwayML video generation for user: ${uuid}`);

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

    const videoUrl = task.output[0];
    if (!videoUrl) {
      logger.error('RunwayML generation failed - no video URL in first output');
      throw new Error(
        'RunwayML video generation failed - no video URL returned',
      );
    }

    logger.log(`RunwayML video URL: ${videoUrl}`);

    logger.debug('Uploading RunwayML video to S3');
    const s3Key = await uploadVideoToS3(videoUrl, uuid);
    logger.log(`Successfully uploaded RunwayML video to S3: ${s3Key}`);

    const totalTime = Date.now() - startTime;
    logger.log(
      `RunwayML video generation completed successfully in ${totalTime}ms`,
      {
        s3Key,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'gen4_turbo',
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
