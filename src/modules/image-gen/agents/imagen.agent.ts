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
    segmentId: string;
    projectId: string;
  }>({
    name: 'Imagen Text-Based Image Agent',
    instructions: `You are an image generation agent that uses Google's Imagen model. 

When you receive a request to generate an image, you MUST immediately call the generate_imagen_image tool with the provided visual_prompt, art_style, and uuid parameters.

Do not just respond with text - always call the generation tool to create the actual image.

You are perfect for images containing text, logos, signs, artistic styles, and creative content.`,
    tools: [
      tool({
        name: 'generate_imagen_image',
        description:
          'Generate image with text/artistic content using Imagen model.',
        parameters: z.object({
          visual_prompt: z.string(),
          art_style: z.string(),
          segmentId: z.string(),
          projectId: z.string(),
        }) as any,
        execute: async ({ visual_prompt, art_style, segmentId, projectId }) => {
          logger.log('Agent selected Imagen for text-based/artistic content');
          try {
            return await generateImagenImage(visual_prompt, art_style, segmentId, projectId);
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
  segmentId: string,
  projectId: string,
): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Imagen image generation for user: ${segmentId}`);

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

    const finalPrompt = `VISUAL PROMPT: ${visual_prompt}. ART STYLE: ${art_style}. Follow the art style but make the image according to the visual prompt. The image should not be a storyboard image. It should be a single image.`;

    // Enhanced logging - log the exact request being sent
    logger.log('=== IMAGEN API REQUEST START ===');
    logger.log(`Request UUID: ${segmentId}`);
    logger.log(`Model: imagen-3.0-generate-002`);
    logger.log(`Prompt length: ${finalPrompt.length} characters`);
    logger.log(`Full prompt: ${finalPrompt}`);
    logger.log(`Number of images requested: 1`);
    logger.log('=== IMAGEN API REQUEST END ===');

    logger.log('Generating image with Google Imagen');

    let response;
    try {
      response = await googleGenAI.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config: { numberOfImages: 1 },
      });
    } catch (apiError) {
      // Enhanced error logging for API failures
      logger.error('=== IMAGEN API ERROR START ===');
      logger.error(`Request UUID: ${segmentId}`);
      logger.error(`Error type: ${apiError.constructor.name}`);
      logger.error(`Error message: ${apiError.message}`);
      logger.error(`Error stack: ${apiError.stack}`);

      // Log additional error details if available
      if (apiError.response) {
        logger.error(`HTTP Status: ${apiError.response.status}`);
        logger.error(
          `HTTP Headers: ${JSON.stringify(apiError.response.headers, null, 2)}`,
        );
        logger.error(
          `Response body: ${JSON.stringify(apiError.response.data, null, 2)}`,
        );
      }

      if (apiError.code) {
        logger.error(`Error code: ${apiError.code}`);
      }

      if (apiError.details) {
        logger.error(
          `Error details: ${JSON.stringify(apiError.details, null, 2)}`,
        );
      }

      logger.error('=== IMAGEN API ERROR END ===');
      throw apiError;
    }

    // Enhanced response logging - log the complete response structure
    logger.log('=== IMAGEN API RESPONSE START ===');
    logger.log(`Request UUID: ${segmentId}`);

    // Log response metadata
    logger.log(`Response type: ${typeof response}`);
    logger.log(`Response constructor: ${response?.constructor?.name}`);

    // Log the raw response structure (safely)
    try {
      const responseKeys = response ? Object.keys(response) : [];
      logger.log(`Response keys: [${responseKeys.join(', ')}]`);

      // Log the full response (but limit size to prevent log overflow)
      const responseString = JSON.stringify(response, null, 2);
      if (responseString.length > 5000) {
        logger.log(
          `Full response (truncated): ${responseString.substring(0, 5000)}...`,
        );
      } else {
        logger.log(`Full response: ${responseString}`);
      }
    } catch (stringifyError) {
      logger.error(`Failed to stringify response: ${stringifyError.message}`);
      logger.log(`Response object inspection: ${response}`);
    }

    // Handle the correct response structure
    const responseData = response as any;

    // Enhanced validation logging
    logger.log('=== IMAGEN RESPONSE VALIDATION START ===');
    logger.log(
      `Has generatedImages property: ${!!responseData.generatedImages}`,
    );
    logger.log(`generatedImages type: ${typeof responseData.generatedImages}`);

    if (responseData.generatedImages) {
      logger.log(
        `generatedImages length: ${responseData.generatedImages.length}`,
      );
      logger.log(
        `generatedImages is array: ${Array.isArray(responseData.generatedImages)}`,
      );

      // Log each generated image info
      responseData.generatedImages.forEach((img, index) => {
        logger.log(
          `Image ${index}: keys = [${Object.keys(img || {}).join(', ')}]`,
        );
        if (img.image) {
          logger.log(
            `Image ${index}.image: keys = [${Object.keys(img.image || {}).join(', ')}]`,
          );
          logger.log(
            `Image ${index}.image.imageBytes length: ${img.image.imageBytes?.length || 'undefined'}`,
          );
          logger.log(
            `Image ${index}.image.mimeType: ${img.image.mimeType || 'undefined'}`,
          );
        }
      });
    } else {
      // Log what properties are actually available
      const availableKeys = responseData ? Object.keys(responseData) : [];
      logger.log(
        `Available response properties: [${availableKeys.join(', ')}]`,
      );

      // Check for alternative response structures
      availableKeys.forEach((key) => {
        const value = responseData[key];
        logger.log(
          `Property '${key}': type=${typeof value}, value=${Array.isArray(value) ? `array[${value.length}]` : value}`,
        );
      });
    }
    logger.log('=== IMAGEN RESPONSE VALIDATION END ===');
    logger.log('=== IMAGEN API RESPONSE END ===');

    if (
      !responseData.generatedImages ||
      responseData.generatedImages.length === 0
    ) {
      logger.error('=== IMAGEN GENERATION FAILURE ANALYSIS START ===');
      logger.error(`Request UUID: ${segmentId}`);
      logger.error(`Reason: No images generated from Imagen API`);
      logger.error(`generatedImages exists: ${!!responseData.generatedImages}`);
      logger.error(
        `generatedImages length: ${responseData.generatedImages?.length || 'N/A'}`,
      );
      logger.error(
        `Full response for debugging: ${JSON.stringify(responseData, null, 2)}`,
      );
      logger.error('=== IMAGEN GENERATION FAILURE ANALYSIS END ===');

      throw new Error('Failed to generate image: no images returned');
    }

    const generatedImage = responseData.generatedImages[0].image;
    if (!generatedImage.imageBytes) {
      logger.error('=== IMAGEN IMAGE DATA FAILURE START ===');
      logger.error(`Request UUID: ${segmentId}`);
      logger.error(`Reason: Empty image data from Imagen API`);
      logger.error(
        `generatedImage keys: [${Object.keys(generatedImage || {}).join(', ')}]`,
      );
      logger.error(`imageBytes exists: ${!!generatedImage.imageBytes}`);
      logger.error(`imageBytes type: ${typeof generatedImage.imageBytes}`);
      logger.error('=== IMAGEN IMAGE DATA FAILURE END ===');

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
    const s3Key = `${projectId}/images/${segmentId}/${randomUUID()}.png`;
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
        segmentId,
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
      segmentId,
      stack: error.stack,
    });
    throw error;
  }
}
