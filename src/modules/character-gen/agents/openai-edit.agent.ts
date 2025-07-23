import { Agent, tool } from '@openai/agents';
import z from 'zod';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SpriteSheetGenerationResult } from '../interfaces/character.interface';
import { getS3ImageUrl } from './s3.service';

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
    You are a character sprite sheet generation specialist using OpenAI's GPT-4 Vision and Image Generation APIs.
    
    Process:
    1. Analyze 6 reference images using GPT-4 Vision
    2. Generate a comprehensive character description and sprite sheet prompt
    3. Create a sprite sheet using OpenAI's DALL-E 3 Image Generation API
    4. Upload the sprite sheet to S3
    
    Always ensure high-quality sprite sheet generation with proper character formatting.
    `,
    tools: [
      tool({
        name: 'generate_sprite_sheet',
        description:
          'Generate character sprite sheet from reference images using OpenAI',
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
    // Step 1: Convert S3 keys to accessible URLs for GPT-4 Vision
    logger.log('Converting S3 keys to accessible URLs');
    const imageUrls = reference_images.map((s3Key) => getS3ImageUrl(s3Key));
    logger.log(`Converted ${imageUrls.length} S3 keys to URLs`);

    // Step 2: Analyze reference images with GPT-4 Vision
    logger.log('Analyzing reference images with GPT-4 Vision');

    const visionResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze these 6 character reference images and create a comprehensive character description and sprite sheet prompt. 
                
                Character details:
                - Visual prompt: ${visual_prompt}
                - Art style: ${art_style}
                
                Create a detailed sprite sheet prompt that includes:
                1. Character appearance and features
                2. Different poses and expressions
                3. Consistent art style
                4. Proper sprite sheet layout
                
                Return a JSON object with:
                - character_description: Detailed character analysis
                - sprite_sheet_prompt: Specific prompt for sprite sheet generation
                - layout_instructions: How to arrange the character in sprite sheet format`,
              },
              ...imageUrls.map((imageUrl) => ({
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              })),
            ],
          },
        ],
        max_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const visionResult = JSON.parse(
      visionResponse.data.choices[0].message.content,
    );
    logger.log('GPT-4 Vision analysis completed');

    // Step 2: Generate sprite sheet using OpenAI Image Generation API (DALL-E)
    logger.log('Generating sprite sheet with OpenAI Image Generation API');

    const generationResponse = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        prompt: visionResult.sprite_sheet_prompt,
        n: 1,
        size: '256x256',
        model: 'dall-e-2',
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const spriteSheetUrl = generationResponse.data.data[0].url;
    logger.log('OpenAI Image Generation completed');

    // Step 3: Download and upload to S3
    logger.log('Downloading generated sprite sheet');
    const imageResponse = await axios.get(spriteSheetUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty image buffer received from OpenAI');
      throw new Error('Failed to download generated sprite sheet from OpenAI');
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
      `OpenAI sprite sheet generation completed successfully in ${totalTime}ms`,
      {
        s3_key: s3Key,
        image_size_bytes: imageBuffer.length,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'openai-gpt-4-vision-edit',
      image_size_bytes: imageBuffer.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`OpenAI sprite sheet generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    throw error;
  }
}
