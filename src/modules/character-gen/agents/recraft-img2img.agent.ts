import { Agent, tool } from '@openai/agents';
import z from 'zod';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CharacterGenerationResult } from '../interfaces/character.interface';

const logger = new Logger('Recraft Image-to-Image Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const createRecraftImg2ImgAgent = () =>
  new Agent<{
    sprite_sheet_s3_key: string;
    visual_prompt: string;
    art_style: string;
    uuid: string;
  }>({
    name: 'Recraft Image-to-Image Agent',
    instructions: `
    You are a character generation specialist using Recraft's image-to-image model.
    
    Process:
    1. Take a sprite sheet as input image
    2. Apply user's visual prompt and art style
    3. Generate final character variations using Recraft's image-to-image
    4. Upload the final character to S3
    
    Always ensure high-quality character generation with proper styling and consistency.
    `,
    tools: [
      tool({
        name: 'generate_final_character',
        description:
          'Generate final character using Recraft image-to-image model',
        parameters: z.object({
          sprite_sheet_s3_key: z.string(),
          visual_prompt: z.string(),
          art_style: z.string(),
          uuid: z.string(),
        }) as any,
        execute: async ({
          sprite_sheet_s3_key,
          visual_prompt,
          art_style,
          uuid,
        }) => {
          logger.log(
            'Recraft Image-to-Image agent starting final character generation',
          );
          try {
            return await generateFinalCharacter(
              sprite_sheet_s3_key,
              visual_prompt,
              art_style,
              uuid,
            );
          } catch (error) {
            logger.error('Recraft image-to-image generation failed:', error);
            throw new Error(
              `Recraft image-to-image generation failed: ${error.message}`,
            );
          }
        },
      }),
    ],
  });

async function generateFinalCharacter(
  sprite_sheet_s3_key: string,
  visual_prompt: string,
  art_style: string,
  uuid: string,
): Promise<CharacterGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Recraft image-to-image generation for user: ${uuid}`);

  try {
    // Step 1: Get sprite sheet from S3 as base64
    logger.log('Downloading sprite sheet from S3');
    const spriteSheetBase64 = await getImageFromS3AsBase64(sprite_sheet_s3_key);

    // Step 2: Prepare the prompt for Recraft image-to-image
    const recraftPrompt = `${visual_prompt}. Art style: ${art_style}. Create a final character based on the sprite sheet with consistent styling and high quality.`;

    logger.log('Starting Recraft image-to-image generation');
    let response;
    try {
      response = await axios.post(
        'https://external.api.recraft.ai/v1/images/img2img',
        {
          prompt: recraftPrompt,
          image: spriteSheetBase64,
          strength: 0.7, // Control how much to change from the original
          style: 'realistic_image',
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
      logger.error('Recraft image-to-image API request failed:', {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      if (axiosError.response?.status === 400) {
        throw new Error(
          `Recraft image-to-image API returned 400 Bad Request: ${JSON.stringify(axiosError.response.data)}`,
        );
      } else if (axiosError.response?.status === 401) {
        throw new Error(
          'Recraft image-to-image API authentication failed - invalid API key',
        );
      } else if (axiosError.response?.status === 429) {
        throw new Error(
          'Recraft image-to-image API rate limit exceeded - please try again later',
        );
      } else {
        throw new Error(
          `Recraft image-to-image API request failed: ${axiosError.message}`,
        );
      }
    }

    logger.log('Recraft image-to-image generation completed');

    if (
      !response.data ||
      !response.data.data ||
      response.data.data.length === 0
    ) {
      logger.error(
        'Recraft image-to-image generation failed - no images returned',
      );
      throw new Error(
        'Recraft image-to-image generation failed - no images returned',
      );
    }

    const imageData = response.data.data[0];
    const imageUrl = imageData.url;

    if (!imageUrl) {
      logger.error(
        'Recraft image-to-image generation failed - no image URL returned',
      );
      throw new Error(
        'Recraft image-to-image generation failed - no image URL returned',
      );
    }

    logger.log('Downloading generated final character from Recraft');

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty image buffer received from Recraft');
      throw new Error(
        'Failed to download generated final character from Recraft',
      );
    }

    // Upload to S3
    const s3Key = `${uuid}/final-characters/${randomUUID()}.png`;
    logger.log(`Uploading final character to S3 with key: ${s3Key}`);

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
      `Recraft image-to-image generation completed successfully in ${totalTime}ms`,
      {
        s3_key: s3Key,
        image_size_bytes: imageBuffer.length,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'recraft-image-to-image',
      image_size_bytes: imageBuffer.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(
      `Recraft image-to-image generation failed after ${totalTime}ms`,
      {
        error: error.message,
        uuid,
        stack: error.stack,
      },
    );
    throw error;
  }
}

async function getImageFromS3AsBase64(s3Key: string): Promise<string> {
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
    const base64 = buffer.toString('base64');

    const downloadTime = Date.now() - startTime;
    logger.debug(
      `Successfully downloaded and converted image to base64 in ${downloadTime}ms (size: ${buffer.length} bytes)`,
    );

    return base64;
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
