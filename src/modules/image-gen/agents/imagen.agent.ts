import { Agent, tool } from '@openai/agents';
import z from 'zod';
import { Logger } from '@nestjs/common';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ImageGenerationResult } from '../image-gen.service';
import { GoogleGenAI } from '@google/genai';

const bucketName = process.env.S3_BUCKET_NAME;

const logger = new Logger('Recraft Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const googleGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const createImagenAgent = () =>
  new Agent<{
    visual_prompt: string;
    art_style: string;
    uuid: string;
  }>({
    name: 'Imagen Text-Based Image Agent',
    instructions:
      "You create images with text, stylized content, and artistic visuals using Google's Imagen model. Perfect for images containing text, logos, signs, artistic styles, and creative content.",
    tools: [
      tool({
        name: 'generate_imagen_image',
        description:
          'Generate image with text/artistic content using Imagen model.',
        parameters: z.object({
          visual_prompt: z.string(),
          art_style: z.string(),
          uuid: z.string(),
        }) as any,
        execute: async ({ visual_prompt, art_style, uuid }) => {
          logger.log('Agent selected Imagen for text-based/artistic content');
          try {
            return await generateImagenImage(visual_prompt, art_style, uuid);
          } catch (error) {
            logger.error('Imagen image generation failed:', error);
            throw new Error(`Imagen image generation failed: ${error.message}`);
          }
        },
      }),
    ],
  });

async function generateImagenImage(
  visual_prompt: string,
  art_style: string,
  uuid: string,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Imagen image generation for user: ${uuid}`);

  try {
    // Trim visual_prompt to ensure total prompt length stays reasonable (under 2000 characters)
    const additionalText = `. ART STYLE: ${art_style}. Follow the art style but make the image according to the visual prompt. The image should not be a storyboard image. It should be a single image.`;
    const maxVisualPromptLength =
      2000 - additionalText.length - 'VISUAL PROMPT: '.length;

    if (visual_prompt.length > maxVisualPromptLength) {
      logger.warn(
        `visual_prompt exceeded ${maxVisualPromptLength} characters (${visual_prompt.length}), trimming to ${maxVisualPromptLength} characters.`,
      );
      visual_prompt = visual_prompt.substring(0, maxVisualPromptLength).trim();
    }

    logger.log('Generating image with Google Imagen');
    const response = await googleGenAI.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: `VISUAL PROMPT: ${visual_prompt}. ART STYLE: ${art_style}. Follow the art style but make the image according to the visual prompt. The image should not be a storyboard image. It should be a single image.`,
      config: { numberOfImages: 1 },
    });

    // Handle the correct response structure
    const responseData = response as any;
    if (
      !responseData.generatedImages ||
      responseData.generatedImages.length === 0
    ) {
      logger.error('No images generated from Imagen API');
      throw new Error('Failed to generate image: no images returned');
    }

    const generatedImage = responseData.generatedImages[0].image;
    if (!generatedImage.imageBytes) {
      logger.error('Empty image data from Imagen API');
      throw new Error('Failed to generate image: empty image data');
    }

    logger.log('Processing generated Imagen image');
    // Convert base64 imageBytes to Buffer
    const imageBuffer = Buffer.from(generatedImage.imageBytes, 'base64');

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty image buffer received from Imagen');
      throw new Error('Failed to process generated image');
    }

    // Upload to S3
    const s3Key = `${uuid}/images/${randomUUID()}.png`;
    logger.log(`Uploading Imagen image to S3 with key: ${s3Key}`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentLength: imageBuffer.length,
      ContentType: generatedImage.mimeType || 'image/png',
    });

    await s3.send(command);

    const totalTime = Date.now() - startTime;
    logger.log(
      `Imagen image generation completed successfully in ${totalTime}ms`,
      {
        s3_key: s3Key,
        image_size_bytes: imageBuffer.length,
        uuid,
      },
    );

    return {
      s3_key: s3Key,
      model: 'imagen-3.0-generate-002',
      image_size_bytes: imageBuffer.length,
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Imagen image generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    throw error;
  }
}
