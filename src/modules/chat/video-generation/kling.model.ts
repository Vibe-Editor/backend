import { Logger } from '@nestjs/common';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../../video-gen/s3/s3.service';
import { fal } from '@fal-ai/client';

const logger = new Logger('Kling Model');

export async function klingVideoGen(
  uuid: string,
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
) {
  console.log(process.env.FAL_KEY);
  fal.config({
    credentials: process.env.FAL_KEY,
  });
  
  const startTime = Date.now();
  logger.log(`Starting Kling video generation for user: ${uuid}`);

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
    logger.debug(`Calling fal.ai with prompt: ${combinedPrompt.substring(0, 100)}...`);
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

    logger.log(`Kling video URL: ${result.data.video.url}`);

    logger.debug('Uploading Kling video to S3');
    const s3Key = await uploadVideoToS3(result.data.video.url, uuid);
    logger.log(`Successfully uploaded Kling video to S3: ${s3Key}`);

    const totalTime = Date.now() - startTime;
    logger.log(
      `Kling video generation completed successfully in ${totalTime}ms`,
      {
        s3Key,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'kling-v2.1-master',
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Kling video generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    
    // Add more specific error logging for fal.ai issues
    if (error.message === 'Forbidden') {
      logger.error('Fal.ai API returned Forbidden - check your FAL_KEY environment variable and account permissions');
    }
    
    throw error;
  }
}
