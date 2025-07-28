/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Agent, tool } from '@openai/agents';
import z from 'zod';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SpriteSheetGenerationResult } from '../interfaces/character.interface';
import OpenAI from 'openai';

const logger = new Logger('OpenAI Edit Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const createOpenAIEditAgent = () =>
  new Agent<{
    reference_images: string[];
    visual_prompt: string;
    art_style: string;
    uuid: string;
  }>({
    name: 'OpenAI Edit Agent',
    instructions: `
    You are a character sprite sheet generation specialist using OpenAI's GPT-Image-1 model.
    
    Process:
    1. Take 6 reference images as input
    2. Generate a sprite sheet using GPT-Image-1 image editing
    3. Upload the sprite sheet to S3
    
    Always ensure high-quality sprite sheet generation with proper character formatting.
    `,
    tools: [
      tool({
        name: 'generate_sprite_sheet',
        description:
          'Generate character sprite sheet from reference images using OpenAI GPT-Image-1',
        parameters: z.object({
          reference_images: z.array(z.string()),
          visual_prompt: z.string(),
          art_style: z.string(),
          uuid: z.string(),
        }) as any,
        execute: async ({
          reference_images,
          visual_prompt,
          art_style,
          uuid,
        }) => {
          logger.log('OpenAI Edit agent starting sprite sheet generation');
          try {
            return await generateSpriteSheet(
              reference_images,
              visual_prompt,
              art_style,
              uuid,
            );
          } catch (error) {
            logger.error('OpenAI sprite sheet generation failed:', error);
            throw new Error(
              `OpenAI sprite sheet generation failed: ${error.message}`,
            );
          }
        },
      }),
    ],
  });

async function generateSpriteSheet(
  reference_images: string[],
  visual_prompt: string,
  art_style: string,
  uuid: string,
): Promise<SpriteSheetGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting OpenAI sprite sheet generation for user: ${uuid}`);

  try {
    // Step 1: Download all 6 reference images from S3
    logger.log('Downloading reference images from S3');
    const imageBuffers: Buffer[] = [];

    for (const s3Key of reference_images) {
      const imageBuffer = await downloadImageFromS3(s3Key);
      imageBuffers.push(imageBuffer);
    }
    logger.log(`Downloaded ${imageBuffers.length} reference images`);

    // Step 2: Generate sprite sheet using GPT-Image-1 edit API
    logger.log('Generating sprite sheet with GPT-Image-1 edit API');

    const spriteSheetPrompt = `Create a character rotation sheet based on these reference images.
    Art style: ${art_style}.

    The character rotation sheet should include:
    1. Closeup of face from front view
    2. Closeup of face from side view (profile)
    3. Closeup of face from 3/4 angle view
    4. Full body shot from front view
    5. Full body shot from side view (profile)
    6. Consistent art style matching the references
    7. Proper character rotation sheet layout (256x256 pixels)`;

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Convert buffers to File objects for the API
    const imageFiles = imageBuffers.map((buffer, index) => {
      const uint8Array = new Uint8Array(buffer);
      const blob = new Blob([uint8Array], { type: 'image/png' });
      return new File([blob], `reference-${index}.png`, { type: 'image/png' });
    });

    logger.debug(`Prepared ${imageFiles.length} image files for API call`);

    // Use the images.edit API with multiple images
    // The API expects 'image[]' parameter for multiple images in multipart form data
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', spriteSheetPrompt);

    // Add all images with the 'image[]' parameter name
    imageFiles.forEach((file, index) => {
      formData.append('image[]', file);
    });

    // Make the request using axios since the OpenAI SDK doesn't support the 'image[]' parameter
    const response = await axios.post(
      'https://api.openai.com/v1/images/edits',
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'json',
      },
    );

    const result = response.data;

    if (!result.data || result.data.length === 0) {
      logger.error('No image data received from GPT-Image-1');
      throw new Error('GPT-Image-1 did not generate an image');
    }

    const imageBase64 = result.data[0].b64_json;
    if (!imageBase64) {
      logger.error('No base64 data in GPT-Image-1 response');
      throw new Error('GPT-Image-1 response missing base64 data');
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty image buffer received from GPT-Image-1');
      throw new Error('Failed to generate sprite sheet from GPT-Image-1');
    }

    // Upload to S3
    const s3Key = `${uuid}/sprite-sheets/${randomUUID()}.png`;
    logger.log(`Uploading sprite sheet to S3 with key: ${s3Key}`);

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentLength: imageBuffer.length,
      ContentType: 'image/png',
    });

    await s3.send(command);

    const totalTime = Date.now() - startTime;
    logger.log(
      `GPT-Image-1 sprite sheet generation completed successfully in ${totalTime}ms`,
      {
        s3_key: s3Key,
        image_size_bytes: imageBuffer.length,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'gpt-image-1-sprite-sheet',
      image_size_bytes: imageBuffer.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(
      `GPT-Image-1 sprite sheet generation failed after ${totalTime}ms`,
      {
        error: error.message,
        uuid,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
      },
    );
    throw error;
  }
}

async function downloadImageFromS3(s3Key: string): Promise<Buffer> {
  const startTime = Date.now();
  try {
    logger.debug(
      `Downloading image from S3 bucket: ${process.env.S3_BUCKET_NAME}, key: ${s3Key}`,
    );

    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    const response = await s3.send(command);
    const chunks = [];

    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    const downloadTime = Date.now() - startTime;
    logger.debug(
      `Successfully downloaded image in ${downloadTime}ms (size: ${buffer.length} bytes)`,
    );

    return buffer;
  } catch (error) {
    const downloadTime = Date.now() - startTime;
    logger.error(`Failed to fetch image from S3 after ${downloadTime}ms`, {
      s3Key,
      bucket: process.env.S3_BUCKET_NAME,
      error: error.message,
    });
    throw new Error('Failed to fetch image from S3');
  }
}
