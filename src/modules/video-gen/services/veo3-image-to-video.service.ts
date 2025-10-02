import { Logger } from '@nestjs/common';
import { uploadVideoToS3 } from '../s3/s3.service';
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
  aspect_ratio: string = '16:9',
  resolution: string = '720p',
  generate_audio: boolean = true,
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

  // Determine the proper image URL for Veo3 API
  let imageUrl: string;
  if (imageS3Key.startsWith('https://')) {
    // Already a full URL (CloudFront URL)
    imageUrl = imageS3Key;
    logger.log(`Using provided CloudFront URL: ${imageUrl}`);
  } else {
    // Convert S3 key to CloudFront URL
    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN || 'ds0fghatf06yb.cloudfront.net';
    // Decode any URL encoding in the S3 key, then re-encode for URL
    const decodedKey = decodeURIComponent(imageS3Key);
    imageUrl = `https://${cloudFrontDomain}/${encodeURIComponent(decodedKey)}`;
    logger.log(`Generated CloudFront URL from S3 key: ${imageUrl}`);
  }

  try {
    logger.log('Starting Veo3 image-to-video generation with Fal.ai');
    logger.log(`Using image URL: ${imageUrl}`);

    const response = await fetch('https://fal.run/fal-ai/veo3/image-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        image_url: imageUrl,
        duration: duration,
        aspect_ratio: aspect_ratio,
        resolution: resolution,
        generate_audio: generate_audio,
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
