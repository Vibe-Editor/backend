import { Logger } from '@nestjs/common';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../s3/s3.service';
import 'dotenv/config';

const logger = new Logger('Veo3ImageToVideoService');

export interface ImageToVideoResult {
  s3Key: string;
  model: string;
}

export async function generateVeo3ImageToVideo(
  imageS3Key: string,
  prompt: string,
  duration: string = '8s',
  segmentId: string,
  projectId: string,
): Promise<ImageToVideoResult> {
  logger.log(`Starting Veo3 image-to-video generation for segment: ${segmentId}`);

  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY environment variable not set');
  }

  const maxPromptLength = 2000;
  let finalPrompt = prompt;

  if (prompt.length > maxPromptLength) {
    logger.warn(
      `Prompt exceeded ${maxPromptLength} characters (${prompt.length}), trimming to ${maxPromptLength} characters.`,
    );
    finalPrompt = prompt.substring(0, maxPromptLength).trim();
  }

  try {
    logger.log(`Fetching image from S3: ${imageS3Key}`);
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);
    logger.log(
      `Successfully converted image to base64 (${imageBase64.length} chars)`,
    );

    logger.log('Starting Veo3 image-to-video generation with Fal.ai');

    const response = await fetch('https://fal.run/fal-ai/veo3', {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        image_url: `data:image/png;base64,${imageBase64}`,
        duration: duration,
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
    logger.log('Veo3 image-to-video generation completed, processing result');

    if (!result.video || !result.video.url) {
      logger.error('Veo3 generation failed - no video URL returned');
      throw new Error('Veo3 video generation failed - no video URL returned');
    }

    logger.log(`Veo3 generated video, starting S3 upload`);

    const s3Key = await uploadVideoToS3(result.video.url, segmentId, projectId);

    logger.log(`Successfully uploaded Veo3 video to S3: ${s3Key}`);

    return {
      s3Key,
      model: 'veo3',
    };
  } catch (error) {
    logger.error(`Veo3 image-to-video generation failed: ${error.message}`);
    throw error;
  }
}
