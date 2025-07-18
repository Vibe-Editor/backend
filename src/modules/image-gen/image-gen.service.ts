import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ImageGenDto } from './dto/image-gen.dto';
import { GoogleGenAI } from '@google/genai';
import { Agent, handoff, run } from '@openai/agents';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { createRecraftAgent } from './agents/recraft.agent';
import { createImagenAgent } from './agents/imagen.agent';

export interface ImageGenerationResult {
  s3_key: string;
  model: string;
  image_size_bytes: number;
}

@Injectable()
export class ImageGenService {
  private readonly logger = new Logger(ImageGenService.name);
  private readonly prisma = new PrismaClient();
  private readonly genAI: GoogleGenAI;

  constructor(private readonly projectHelperService: ProjectHelperService) {
    try {
      // Validate environment variables
      if (!process.env.GEMINI_API_KEY) {
        this.logger.error('GEMINI_API_KEY environment variable not set');
        throw new Error('GEMINI_API_KEY environment variable not set');
      }

      if (!process.env.RECRAFT_API_KEY) {
        this.logger.error('RECRAFT_API_KEY environment variable not set');
        throw new Error('RECRAFT_API_KEY environment variable not set');
      }

      if (!process.env.S3_BUCKET_NAME) {
        this.logger.error('S3_BUCKET_NAME environment variable not set');
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      this.genAI = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
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

    const RecraftAgent = createRecraftAgent();
    const ImagenAgent = createImagenAgent();

    const triageAgent = Agent.create({
      name: 'Image Generation Triage Agent',
      model: 'gpt-4o-mini',
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

      // If it's a known NestJS exception, rethrow it
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Otherwise, throw the original error message as an internal server error
      throw new InternalServerErrorException(
        error.message || 'Failed to generate image.',
      );
    }
  }

  /**
   * Get all generated images for a user, optionally filtered by project
   */
  async getAllImages(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const images = await this.prisma.generatedImage.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      this.logger.log(
        `Retrieved ${images.length} generated images for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: images.length,
        images,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve images: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve images: ${error.message}`,
      );
    }
  }

  /**
   * Get a specific generated image by ID for a user
   */
  async getImageById(imageId: string, userId: string) {
    try {
      const image = await this.prisma.generatedImage.findFirst({
        where: {
          id: imageId,
          userId, // Ensure user can only access their own images
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!image) {
        throw new NotFoundException(
          `Generated image with ID ${imageId} not found or you don't have access to it`,
        );
      }

      this.logger.log(
        `Retrieved generated image ${imageId} for user ${userId}`,
      );

      return {
        success: true,
        image,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve image ${imageId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve image: ${error.message}`,
      );
    }
  }
}
