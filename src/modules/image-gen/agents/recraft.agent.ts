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
    instructions: `You are an image generation agent that uses the Recraft AI model.

When you receive a request to generate an image, you MUST immediately call the generate_recraft_image tool with the provided visual_prompt, art_style, and uuid parameters.

Do not just respond with text - always call the generation tool to create the actual image.

You are perfect for realistic scenes, landscapes, portraits, objects without text elements, photographic content, and 3D rendered images.`,
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
    // Trim visual_prompt to ensure total prompt length stays well under 1000 characters (using 950 for safety buffer)
    const additionalText = `. Art style: ${art_style}. Create a realistic, photographic image with no text elements.`;
    const maxVisualPromptLength = 950 - additionalText.length;

    logger.debug(`Initial visual_prompt length: ${visual_prompt.length}`);
    logger.debug(`Additional text length: ${additionalText.length}`);
    logger.debug(`Max allowed visual_prompt length: ${maxVisualPromptLength}`);
    logger.debug(`Art style: "${art_style}" (${art_style.length} chars)`);

    if (visual_prompt.length > maxVisualPromptLength) {
      logger.warn(
        `visual_prompt exceeded ${maxVisualPromptLength} characters (${visual_prompt.length}), trimming to ${maxVisualPromptLength} characters.`,
      );
      visual_prompt = visual_prompt.substring(0, maxVisualPromptLength).trim();
      logger.debug(`Trimmed visual_prompt length: ${visual_prompt.length}`);
    }

    // Prepare the prompt for Recraft
    let recraftPrompt = `${visual_prompt}. Art style: ${art_style}. Create a realistic, photographic image with no text elements.`;

    // Debug logging to verify prompt length
    logger.debug(`Final prompt length: ${recraftPrompt.length} characters`);

    // Additional safety check - ensure final prompt doesn't exceed 950 characters (with safety buffer)
    if (recraftPrompt.length > 950) {
      logger.error(
        `Final prompt still exceeds 950 characters (${recraftPrompt.length}). Applying emergency trim.`,
      );
      recraftPrompt = recraftPrompt.substring(0, 950).trim();
      logger.warn(
        `Emergency trimmed prompt to ${recraftPrompt.length} characters`,
      );
    }

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
      // Enhanced logging - log the exact request being sent
      logger.log('=== RECRAFT API REQUEST START ===');
      logger.log(`Request UUID: ${uuid}`);
      logger.log(`Model: realistic_image`);
      logger.log(`Prompt length: ${recraftPrompt.length} characters`);
      logger.log(`Full prompt: ${recraftPrompt}`);
      logger.log(`Size: 1024x1024`);
      logger.log(`Number of images requested: 1`);
      logger.log(`Substyle: ${substyle}`);
      logger.log(
        `API Endpoint: https://external.api.recraft.ai/v1/images/generations`,
      );
      logger.log('=== RECRAFT API REQUEST END ===');

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

      // Enhanced response logging - log the complete response structure
      logger.log('=== RECRAFT API RESPONSE START ===');
      logger.log(`Request UUID: ${uuid}`);
      logger.log(`HTTP Status: ${response.status}`);
      logger.log(`HTTP Status Text: ${response.statusText}`);

      // Log response headers (especially for rate limiting info)
      if (response.headers) {
        logger.log('Response Headers:');
        Object.keys(response.headers).forEach((header) => {
          // Log rate limiting and important headers
          if (
            header.toLowerCase().includes('rate') ||
            header.toLowerCase().includes('limit') ||
            header.toLowerCase().includes('remaining') ||
            header.toLowerCase().includes('reset') ||
            header.toLowerCase().includes('retry') ||
            header.toLowerCase() === 'content-type' ||
            header.toLowerCase() === 'content-length'
          ) {
            logger.log(`  ${header}: ${response.headers[header]}`);
          }
        });
      }

      // Log response data structure
      if (response.data) {
        logger.log(`Response data type: ${typeof response.data}`);
        logger.log(
          `Response data keys: [${Object.keys(response.data || {}).join(', ')}]`,
        );

        // Log the full response data (but limit size)
        try {
          const responseString = JSON.stringify(response.data, null, 2);
          if (responseString.length > 3000) {
            logger.log(
              `Response data (truncated): ${responseString.substring(0, 3000)}...`,
            );
          } else {
            logger.log(`Response data: ${responseString}`);
          }
        } catch (stringifyError) {
          logger.error(
            `Failed to stringify response data: ${stringifyError.message}`,
          );
        }
      }
      logger.log('=== RECRAFT API RESPONSE END ===');
    } catch (axiosError) {
      // Enhanced error logging for API failures
      logger.error('=== RECRAFT API ERROR START ===');
      logger.error(`Request UUID: ${uuid}`);
      logger.error(`Error type: ${axiosError.constructor.name}`);
      logger.error(`Error message: ${axiosError.message}`);
      logger.error(`Error code: ${axiosError.code || 'N/A'}`);

      if (axiosError.response) {
        logger.error(`HTTP Status: ${axiosError.response.status}`);
        logger.error(`HTTP Status Text: ${axiosError.response.statusText}`);

        // Log response headers for rate limiting info
        if (axiosError.response.headers) {
          logger.error('Response Headers:');
          Object.keys(axiosError.response.headers).forEach((header) => {
            logger.error(`  ${header}: ${axiosError.response.headers[header]}`);
          });
        }

        // Log full error response
        try {
          const errorResponseString = JSON.stringify(
            axiosError.response.data,
            null,
            2,
          );
          logger.error(`Error Response Data: ${errorResponseString}`);
        } catch (stringifyError) {
          logger.error(
            `Error Response Data (raw): ${axiosError.response.data}`,
          );
        }
      }

      if (axiosError.request) {
        logger.error(`Request details: ${axiosError.request._header || 'N/A'}`);
      }

      logger.error(`Error stack: ${axiosError.stack}`);
      logger.error('=== RECRAFT API ERROR END ===');

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

    // Enhanced validation logging
    logger.log('=== RECRAFT RESPONSE VALIDATION START ===');
    logger.log(`Request UUID: ${uuid}`);
    logger.log(`Response.data exists: ${!!response.data}`);
    logger.log(`Response.data.data exists: ${!!response.data?.data}`);
    logger.log(
      `Response.data.data is array: ${Array.isArray(response.data?.data)}`,
    );
    logger.log(
      `Response.data.data length: ${response.data?.data?.length || 'N/A'}`,
    );

    if (response.data?.data?.length > 0) {
      response.data.data.forEach((item, index) => {
        logger.log(
          `Item ${index} keys: [${Object.keys(item || {}).join(', ')}]`,
        );
        logger.log(`Item ${index}.url exists: ${!!item?.url}`);
        logger.log(`Item ${index}.url: ${item?.url || 'N/A'}`);
      });
    }
    logger.log('=== RECRAFT RESPONSE VALIDATION END ===');

    if (
      !response.data ||
      !response.data.data ||
      response.data.data.length === 0
    ) {
      logger.error('=== RECRAFT GENERATION FAILURE ANALYSIS START ===');
      logger.error(`Request UUID: ${uuid}`);
      logger.error(`Reason: Recraft generation failed - no images returned`);
      logger.error(`response.data exists: ${!!response.data}`);
      logger.error(`response.data.data exists: ${!!response.data?.data}`);
      logger.error(
        `response.data.data length: ${response.data?.data?.length || 'N/A'}`,
      );
      logger.error(
        `Full response.data for debugging: ${JSON.stringify(response.data, null, 2)}`,
      );
      logger.error('=== RECRAFT GENERATION FAILURE ANALYSIS END ===');

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
