import { Agent, tool } from '@openai/agents';
import z from 'zod';
import { Logger } from '@nestjs/common';
import 'dotenv/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ImageGenerationResult } from '../image-gen.service';

const bucketName = process.env.S3_BUCKET_NAME;

const logger = new Logger('Recraft Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const createRecraftAgent = () =>
  new Agent<{
    visual_prompt: string;
    art_style: string;
    uuid: string;
  }>({
    name: 'Recraft Realistic Image Agent',
    instructions:
      'You create realistic, photographic images with no text using the Recraft AI model. Perfect for realistic scenes, landscapes, portraits, and objects without any text elements.',
    tools: [
      tool({
        name: 'generate_recraft_image',
        description: 'Generate realistic image using Recraft AI model.',
        parameters: z.object({
          visual_prompt: z.string(),
          art_style: z.string(),
          uuid: z.string(),
        }) as any,
        execute: async ({ visual_prompt, art_style, uuid }) => {
          logger.log(
            'Agent selected Recraft for realistic content without text',
          );
          try {
            return await generateRecraftImage(visual_prompt, art_style, uuid);
          } catch (error) {
            logger.error('Recraft image generation failed:', error);
            throw new Error(
              `Recraft image generation failed: ${error.message}`,
            );
          }
        },
      }),
    ],
  });

async function generateRecraftImage(
  visual_prompt: string,
  art_style: string,
  uuid: string,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Recraft image generation for user: ${uuid}`);

  try {
    // Trim visual_prompt to ensure total prompt length stays under 999 characters
    const additionalText = `. Art style: ${art_style}. Create a realistic, photographic image with no text elements.`;
    const maxVisualPromptLength = 999 - additionalText.length;

    if (visual_prompt.length > maxVisualPromptLength) {
      logger.warn(
        `visual_prompt exceeded ${maxVisualPromptLength} characters (${visual_prompt.length}), trimming to ${maxVisualPromptLength} characters.`,
      );
      visual_prompt = visual_prompt.substring(0, maxVisualPromptLength).trim();
    }

    // Prepare the prompt for Recraft
    const recraftPrompt = `${visual_prompt}. Art style: ${art_style}. Create a realistic, photographic image with no text elements.`;

    // Determine substyle based on art_style
    let substyle = 'natural';
    if (
      art_style.toLowerCase().includes('black and white') ||
      art_style.toLowerCase().includes('b&w')
    ) {
      substyle = 'b_and_w';
    } else if (art_style.toLowerCase().includes('cinematic')) {
      substyle = 'cinematic';
    } else if (art_style.toLowerCase().includes('enterprise')) {
      substyle = 'enterprise';
    } else if (art_style.toLowerCase().includes('macro')) {
      substyle = 'macro';
    } else if (art_style.toLowerCase().includes('portrait')) {
      substyle = 'portrait';
    }

    logger.log('Starting Recraft image generation');
    let response;
    try {
      response = await axios.post(
        'https://external.api.recraft.ai/v1/images/generations',
        {
          prompt: recraftPrompt,
          style: 'realistic_image',
          // substyle: substyle,
          size: '1024x1024',
          n: 1,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RECRAFT_API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (axiosError) {
      logger.error('Recraft API request failed:', {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      if (axiosError.response?.status === 400) {
        throw new Error(
          `Recraft API returned 400 Bad Request: ${JSON.stringify(axiosError.response.data)}`,
        );
      } else if (axiosError.response?.status === 401) {
        throw new Error('Recraft API authentication failed - invalid API key');
      } else if (axiosError.response?.status === 429) {
        throw new Error(
          'Recraft API rate limit exceeded - please try again later',
        );
      } else {
        throw new Error(`Recraft API request failed: ${axiosError.message}`);
      }
    }

    logger.log('Recraft image generation completed');

    if (
      !response.data ||
      !response.data.data ||
      response.data.data.length === 0
    ) {
      logger.error('Recraft generation failed - no images returned');
      throw new Error('Recraft image generation failed - no images returned');
    }

    const imageData = response.data.data[0];
    const imageUrl = imageData.url;

    if (!imageUrl) {
      logger.error('Recraft generation failed - no image URL returned');
      throw new Error(
        'Recraft image generation failed - no image URL returned',
      );
    }

    logger.log('Downloading generated image from Recraft');

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty image buffer received from Recraft');
      throw new Error('Failed to download generated image from Recraft');
    }

    // Upload to S3
    const s3Key = `${uuid}/images/${randomUUID()}.png`;
    logger.log(`Uploading Recraft image to S3 with key: ${s3Key}`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentLength: imageBuffer.length,
      ContentType: 'image/png',
    });

    await s3.send(command);

    const totalTime = Date.now() - startTime;
    logger.log(
      `Recraft image generation completed successfully in ${totalTime}ms`,
      {
        s3_key: s3Key,
        image_size_bytes: imageBuffer.length,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'recraft-realistic-image',
      image_size_bytes: imageBuffer.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Recraft image generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    throw error;
  }
}
