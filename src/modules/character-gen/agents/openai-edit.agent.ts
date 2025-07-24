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

    // Step 2: Generate sprite sheet using GPT-Image-1
    logger.log('Generating sprite sheet with GPT-Image-1');

    const spriteSheetPrompt = `Create a character sprite sheet based on these 6 reference images. 
    Character details: ${visual_prompt}. 
    Art style: ${art_style}. 
    
    The sprite sheet should include:
    1. Character appearance and features based on the reference images
    2. Different poses and expressions
    3. Consistent art style matching the references
    4. Proper sprite sheet layout (256x256 pixels)`;

    // Use GPT-Image-1 for image generation with multiple reference images
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', spriteSheetPrompt);
    formData.append('n', '1');
    formData.append('size', '256x256');
    formData.append('response_format', 'b64_json');

    // Add all 6 images to the form data
    imageBuffers.forEach((buffer, index) => {
      const blob = new Blob([buffer as BlobPart], { type: 'image/png' });
      formData.append(`image[]`, blob, `reference-${index}.png`);
    });

    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'json',
      },
    );

    if (
      !response.data ||
      !response.data.data ||
      response.data.data.length === 0
    ) {
      logger.error('No image data received from GPT-Image-1');
      throw new Error('GPT-Image-1 did not generate an image');
    }

    // Extract the base64 image data
    const base64Data = response.data.data[0].b64_json;
    if (!base64Data) {
      logger.error('No base64 data in GPT-Image-1 response');
      throw new Error('GPT-Image-1 response missing base64 data');
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');

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
        stack: error.stack,
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
