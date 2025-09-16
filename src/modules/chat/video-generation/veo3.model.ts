import { Logger } from '@nestjs/common';
import {
  getImageFromS3AsBase64,
  uploadVideoToS3,
} from '../../video-gen/s3/s3.service';

const logger = new Logger('Veo3 Model');

export async function veo3VideoGen(
  segmentId: string,
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  projectId: string,
) {
  const startTime = Date.now();
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
        duration: "8s",
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

    logger.log(`Veo3 video URL: ${result.video.url}`);
    
    logger.log('Uploading Veo3 video to S3');
    const s3Key = await uploadVideoToS3(result.video.url, segmentId, projectId);
    logger.log(`Successfully uploaded Veo3 video to S3: ${s3Key}`);

    const totalTime = Date.now() - startTime;
    logger.log(
      `Veo3 video generation completed successfully in ${totalTime}ms`,
      {
        s3Key,
        segmentId,
      },
    );

    return {
      s3_key: s3Key,
      model: 'veo3',
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Veo3 video generation failed after ${totalTime}ms`, {
      error: error.message,
      segmentId,
      stack: error.stack,
    });

    throw error;
  }
}
