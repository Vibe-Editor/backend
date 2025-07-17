import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { fal } from '@fal-ai/client';
import { ImageGenDto } from './dto/image-gen.dto';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { Agent, tool, handoff, run } from '@openai/agents';
import { z } from 'zod';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';

interface ImageGenerationResult {
  s3_key: string;
  model: string;
  image_size_bytes: number;
}

@Injectable()
export class ImageGenService {
  private readonly logger = new Logger(ImageGenService.name);
  private readonly prisma = new PrismaClient();
  private readonly fal: typeof fal;
  private readonly genAI: GoogleGenAI;
  private readonly s3: S3Client;
  private readonly bucketName = process.env.S3_BUCKET_NAME;

  constructor(private readonly projectHelperService: ProjectHelperService) {
    try {
      // Validate environment variables
      if (!process.env.FAL_KEY) {
        this.logger.error('FAL_API_KEY environment variable not set');
        throw new Error('FAL_API_KEY environment variable not set.');
      }

      if (!process.env.GEMINI_API_KEY) {
        this.logger.error('GEMINI_API_KEY environment variable not set');
        throw new Error('GEMINI_API_KEY environment variable not set');
      }

      if (!process.env.RECRAFT_API_KEY) {
        this.logger.error('RECRAFT_API_KEY environment variable not set');
        throw new Error('RECRAFT_API_KEY environment variable not set');
      }

      if (
        !process.env.AWS_REGION ||
        !process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY
      ) {
        this.logger.error('Missing AWS configuration environment variables');
        throw new Error(
          'Missing AWS configuration: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY are required',
        );
      }

      if (!process.env.S3_BUCKET_NAME) {
        this.logger.error('S3_BUCKET_NAME environment variable not set');
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      this.genAI = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      this.s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      fal.config({
        credentials: process.env.FAL_KEY,
      });

      this.logger.log('ImageGenService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize ImageGenService', error.stack);
      throw error;
    }
  }

  async generateImage(imageGenDto: ImageGenDto, userId: string) {
    // Ensure user has a project (create default if none exists)
    const projectId =
      await this.projectHelperService.ensureUserHasProject(userId);
    this.logger.log(`Using project ${projectId} for image generation`);

    const startTime = Date.now();
    const operationId = imageGenDto.uuid;

    this.logger.log(`Starting image generation [${operationId}]`);
    this.logger.log(
      `Image generation with prompt: ${imageGenDto.visual_prompt?.substring(0, 100)}... [${operationId}]`,
    );

    const createRecraftAgent = () =>
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
              this.logger.log(
                'Agent selected Recraft for realistic content without text',
              );
              try {
                return await this.generateRecraftImage(
                  visual_prompt,
                  art_style,
                  uuid,
                );
              } catch (error) {
                this.logger.error('Recraft image generation failed:', error);
                throw new Error(
                  `Recraft image generation failed: ${error.message}`,
                );
              }
            },
          }),
        ],
      });

    const createImagenAgent = () =>
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
              this.logger.log(
                'Agent selected Imagen for text-based/artistic content',
              );
              try {
                return await this.generateImagenImage(
                  visual_prompt,
                  art_style,
                  uuid,
                );
              } catch (error) {
                this.logger.error('Imagen image generation failed:', error);
                throw new Error(
                  `Imagen image generation failed: ${error.message}`,
                );
              }
            },
          }),
        ],
      });

    const RecraftAgent = createRecraftAgent();
    const ImagenAgent = createImagenAgent();

    const triageAgent = Agent.create({
      name: 'Image Generation Triage Agent',
      instructions: `
      You are an image generation assistant that decides which model to use based on the prompt and art style.
      
      Use Recraft for:
      - Realistic, photographic content without text
      - Natural landscapes, portraits, objects
      - Photorealistic scenes
      - Real-world scenarios without text elements
      - When the art style indicates realism/photography
      
      Use Imagen for:
      - Any content that includes text, words, letters, or signs
      - Artistic, stylized, or creative content
      - Abstract or non-realistic art styles
      - Logos, posters, or graphics with text
      - Cartoon, anime, or illustrated styles
      - When the art style is not realistic/photographic
      
      Analyze both the visual prompt and art style to choose the appropriate model, then hand off to the corresponding agent.`,
      handoffs: [
        handoff(RecraftAgent, {
          toolNameOverride: 'use_recraft_agent',
          toolDescriptionOverride:
            'Send to Recraft agent for realistic images without text.',
        }),
        handoff(ImagenAgent, {
          toolNameOverride: 'use_imagen_agent',
          toolDescriptionOverride:
            'Send to Imagen agent for text-based/artistic content.',
        }),
      ],
    });

    try {
      // Validate input
      if (
        !imageGenDto.visual_prompt ||
        imageGenDto.visual_prompt.trim().length === 0
      ) {
        this.logger.error(`Missing or empty visual_prompt [${operationId}]`);
        throw new BadRequestException(
          'visual_prompt is required and cannot be empty',
        );
      }

      if (!imageGenDto.art_style || imageGenDto.art_style.trim().length === 0) {
        this.logger.error(`Missing or empty art_style [${operationId}]`);
        throw new BadRequestException(
          'art_style is required and cannot be empty',
        );
      }

      if (imageGenDto.visual_prompt.length > 2000) {
        this.logger.error(
          `Visual prompt too long: ${imageGenDto.visual_prompt.length} characters [${operationId}]`,
        );
        throw new BadRequestException(
          'visual_prompt must be less than 2000 characters',
        );
      }

      this.logger.log('Running triage agent to determine model selection');
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `Generate an image with prompt: "${imageGenDto.visual_prompt}"\n art style: "${imageGenDto.art_style}"\n for user: "${imageGenDto.uuid}"`,
        },
      ]);

      this.logger.debug('Agent execution completed, parsing result');
      console.log(result.output);

      // Check if the agent execution contains any errors
      const hasErrors = result.output.some(
        (msg) =>
          msg.type === 'function_call_result' &&
          msg.status === 'completed' &&
          msg.output?.type === 'text' &&
          msg.output?.text?.includes(
            'An error occurred while running the tool',
          ),
      );

      if (hasErrors) {
        this.logger.error('Agent execution contained errors:', result.output);
        throw new InternalServerErrorException(
          'Image generation failed - agent execution contained errors',
        );
      }

      // Parse agent result using Gemini
      try {
        this.logger.log('Using Gemini to parse agent result');
        const geminiParseRes = await this.genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: `Parse this entire agent conversation output and extract the image generation result. Return a JSON object with "s3_key" (string), "model" (string), and "image_size_bytes" (number).

          Full agent output:
          ${JSON.stringify(result.output, null, 2)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                s3_key: { type: 'string' },
                model: { type: 'string' },
                image_size_bytes: { type: 'number' },
              },
              required: ['s3_key', 'model', 'image_size_bytes'],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);
        this.logger.debug('Parsed agent result:', agentResult);

        // Validate that the result is not fake/invalid
        if (
          agentResult?.s3_key &&
          (agentResult.s3_key.includes('fake') ||
            agentResult.s3_key.includes('s3://') ||
            agentResult.s3_key === 'fake-key.png' ||
            !agentResult.s3_key.startsWith(imageGenDto.uuid))
        ) {
          this.logger.error(
            'Detected fake/invalid S3 key from agent result:',
            agentResult,
          );
          throw new InternalServerErrorException(
            'Image generation failed - invalid response from agent',
          );
        }

        if (
          agentResult?.image_size_bytes &&
          agentResult.image_size_bytes < 1000
        ) {
          this.logger.error(
            'Detected fake/invalid image size from agent result:',
            agentResult,
          );
          throw new InternalServerErrorException(
            'Image generation failed - invalid image size in response',
          );
        }

        if (agentResult?.s3_key && agentResult?.model) {
          const totalTime = Date.now() - startTime;
          this.logger.log(
            `Image generation completed successfully in ${totalTime}ms`,
            {
              model: agentResult.model,
              s3_key: agentResult.s3_key,
              image_size_bytes: agentResult.image_size_bytes,
              uuid: imageGenDto.uuid,
            },
          );

          // Save to database
          this.logger.log(`Saving image generation to database`);
          const savedImage = await this.prisma.generatedImage.create({
            data: {
              visualPrompt: imageGenDto.visual_prompt,
              artStyle: imageGenDto.art_style,
              uuid: imageGenDto.uuid,
              success: true,
              s3Key: agentResult.s3_key,
              model: agentResult.model,
              message: 'Image generated and uploaded successfully',
              imageSizeBytes: agentResult.image_size_bytes,
              projectId,
              userId,
            },
          });

          // Save conversation history
          await this.prisma.conversationHistory.create({
            data: {
              type: 'IMAGE_GENERATION',
              userInput: imageGenDto.visual_prompt,
              response: JSON.stringify({
                success: true,
                s3_key: agentResult.s3_key,
                model: agentResult.model,
                message: 'Image generated and uploaded successfully',
                image_size_bytes: agentResult.image_size_bytes,
              }),
              metadata: {
                artStyle: imageGenDto.art_style,
                uuid: imageGenDto.uuid,
                savedImageId: savedImage.id,
              },
              projectId,
              userId,
            },
          });

          this.logger.log(
            `Successfully saved image generation: ${savedImage.id}`,
          );

          return {
            success: true,
            s3_key: agentResult.s3_key,
            model: agentResult.model,
            message: 'Image generated and uploaded successfully',
            image_size_bytes: agentResult.image_size_bytes,
          };
        } else {
          this.logger.error(
            'Agent produced result but no image was successfully uploaded',
            {
              agentResult,
              hasS3Key: !!agentResult?.s3_key,
              hasModel: !!agentResult?.model,
            },
          );
          throw new InternalServerErrorException(
            'Image generation completed but no image was successfully uploaded to S3.',
          );
        }
      } catch (parseError) {
        this.logger.error(
          'Failed to parse agent result with Gemini:',
          parseError,
        );
      }

      throw new InternalServerErrorException(
        'Agent did not produce a valid image generation result.',
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Image generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid: imageGenDto.uuid,
        stack: error.stack,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle quota and authentication errors
      if (
        error.message?.includes('quota') ||
        error.message?.includes('limit') ||
        error.message?.includes('credits')
      ) {
        throw new InternalServerErrorException(
          'API quota exceeded. Please try again later.',
        );
      }

      if (
        error.message?.includes('unauthorized') ||
        error.message?.includes('authentication') ||
        error.message?.includes('API key')
      ) {
        throw new InternalServerErrorException(
          'API authentication failed. Please contact support.',
        );
      }

      if (
        error.message?.includes('timeout') ||
        error.message?.includes('deadline')
      ) {
        throw new InternalServerErrorException(
          'Image generation timed out. Please try again with a simpler prompt.',
        );
      }

      // Handle S3 specific errors
      if (error.name === 'NoSuchBucket' || error.message?.includes('bucket')) {
        this.logger.error(
          `S3 bucket error: ${this.bucketName} [${operationId}]`,
        );
        throw new InternalServerErrorException(
          'Storage configuration error. Please contact support.',
        );
      }

      if (
        error.name === 'AccessDenied' ||
        error.message?.includes('access denied')
      ) {
        this.logger.error(`S3 access denied [${operationId}]`);
        throw new InternalServerErrorException(
          'Storage access denied. Please contact support.',
        );
      }

      throw new InternalServerErrorException(
        'Failed to generate image. Please try again later.',
      );
    }
  }

  /**
   * Generate realistic image using Recraft AI - optimized for realistic content without text
   * @param visual_prompt - Visual prompt for image generation
   * @param art_style - Art style for the image
   * @param uuid - User UUID for organizing uploads
   * @returns ImageGenerationResult with S3 key of generated image
   */
  async generateRecraftImage(
    visual_prompt: string,
    art_style: string,
    uuid: string,
  ): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`Starting Recraft image generation for user: ${uuid}`);

    try {
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

      this.logger.log('Starting Recraft image generation');
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
        this.logger.error('Recraft API request failed:', {
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
          throw new Error(
            'Recraft API authentication failed - invalid API key',
          );
        } else if (axiosError.response?.status === 429) {
          throw new Error(
            'Recraft API rate limit exceeded - please try again later',
          );
        } else {
          throw new Error(`Recraft API request failed: ${axiosError.message}`);
        }
      }

      this.logger.log('Recraft image generation completed');

      if (
        !response.data ||
        !response.data.data ||
        response.data.data.length === 0
      ) {
        this.logger.error('Recraft generation failed - no images returned');
        throw new Error('Recraft image generation failed - no images returned');
      }

      const imageData = response.data.data[0];
      const imageUrl = imageData.url;

      if (!imageUrl) {
        this.logger.error('Recraft generation failed - no image URL returned');
        throw new Error(
          'Recraft image generation failed - no image URL returned',
        );
      }

      this.logger.log('Downloading generated image from Recraft');

      // Download the image
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });
      const imageBuffer = Buffer.from(imageResponse.data);

      if (!imageBuffer || imageBuffer.length === 0) {
        this.logger.error('Empty image buffer received from Recraft');
        throw new Error('Failed to download generated image from Recraft');
      }

      // Upload to S3
      const s3Key = `${uuid}/images/${randomUUID()}.png`;
      this.logger.log(`Uploading Recraft image to S3 with key: ${s3Key}`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: imageBuffer,
        ContentLength: imageBuffer.length,
        ContentType: 'image/png',
      });

      await this.s3.send(command);

      const totalTime = Date.now() - startTime;
      this.logger.log(
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
      this.logger.error(
        `Recraft image generation failed after ${totalTime}ms`,
        {
          error: error.message,
          uuid,
          stack: error.stack,
        },
      );
      throw error;
    }
  }

  /**
   * Generate image using Google's Imagen model - optimized for text-based and artistic content
   * @param visual_prompt - Visual prompt for image generation
   * @param art_style - Art style for the image
   * @param uuid - User UUID for organizing uploads
   * @returns ImageGenerationResult with S3 key of generated image
   */
  async generateImagenImage(
    visual_prompt: string,
    art_style: string,
    uuid: string,
  ): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`Starting Imagen image generation for user: ${uuid}`);

    try {
      this.logger.log('Generating image with Google Imagen');
      const response = await this.genAI.models.generateImages({
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
        this.logger.error('No images generated from Imagen API');
        throw new Error('Failed to generate image: no images returned');
      }

      const generatedImage = responseData.generatedImages[0].image;
      if (!generatedImage.imageBytes) {
        this.logger.error('Empty image data from Imagen API');
        throw new Error('Failed to generate image: empty image data');
      }

      this.logger.log('Processing generated Imagen image');
      // Convert base64 imageBytes to Buffer
      const imageBuffer = Buffer.from(generatedImage.imageBytes, 'base64');

      if (!imageBuffer || imageBuffer.length === 0) {
        this.logger.error('Empty image buffer received from Imagen');
        throw new Error('Failed to process generated image');
      }

      // Upload to S3
      const s3Key = `${uuid}/images/${randomUUID()}.png`;
      this.logger.log(`Uploading Imagen image to S3 with key: ${s3Key}`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: imageBuffer,
        ContentLength: imageBuffer.length,
        ContentType: generatedImage.mimeType || 'image/png',
      });

      await this.s3.send(command);

      const totalTime = Date.now() - startTime;
      this.logger.log(
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
      this.logger.error(`Imagen image generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid,
        stack: error.stack,
      });
      throw error;
    }
  }
}
