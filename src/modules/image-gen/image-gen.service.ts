import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ImageGenDto } from './dto/image-gen.dto';
import { UpdateImageGenDto } from './dto/update-image-gen.dto';
import { GoogleGenAI } from '@google/genai';
import { Agent, handoff, run } from '@openai/agents';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { createRecraftAgent } from './agents/recraft.agent';
import { createImagenAgent } from './agents/imagen.agent';
import { CreditService } from '../credits/credit.service';

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

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {
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
    // Use projectId from body - no fallback project creation logic
    const { visual_prompt, art_style, segmentId, projectId } = imageGenDto;
    this.logger.log(`Using project ${projectId} for image generation`);

    const startTime = Date.now();
    const operationId = segmentId;

    // Enhanced logging for request tracking
    this.logger.log('=== IMAGE GENERATION REQUEST START ===');
    this.logger.log(`Operation ID: ${operationId}`);
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Project ID: ${projectId}`);
    this.logger.log(
      `Visual prompt length: ${visual_prompt?.length || 0} characters`,
    );
    this.logger.log(`Art style: ${art_style}`);
    this.logger.log(`Request timestamp: ${new Date().toISOString()}`);
    this.logger.log('=== IMAGE GENERATION REQUEST START END ===');

    this.logger.log(`Starting image generation [${operationId}]`);
    this.logger.log(
      `Image generation with prompt: ${visual_prompt?.substring(0, 100)}... [${operationId}]`,
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
      - 3D rendered content
      - Industrial or metallic themes
      
      Use Imagen for:
      - Content that specifically includes readable text, words, letters, or signs
      - Artistic, stylized, or creative content
      - Abstract or non-realistic art styles
      - Logos, posters, or graphics with text overlays
      - UI elements, menus, or interface designs
      - Educational diagrams or infographics
      - Cartoon, anime, or illustrated styles
      - When the art style is not realistic/photographic
      
      Analyze both the visual prompt and art style to choose the appropriate model, then hand off to the corresponding agent.`,
      handoffs: [
        handoff(RecraftAgent, {
          toolNameOverride: 'use_recraft_agent',
          toolDescriptionOverride:
            'Send to Recraft agent for realistic, photographic, or 3D rendered images.',
        }),
        handoff(ImagenAgent, {
          toolNameOverride: 'use_imagen_agent',
          toolDescriptionOverride:
            'Send to Imagen agent for artistic content, text-based images, or illustrated styles.',
        }),
      ],
    });

    let creditTransactionId: string | null = null;
    let modelUsed: string | null = null;
    let actualCreditsUsed: number | null = null;

    try {
      // Validate input
      if (!visual_prompt || visual_prompt.trim().length === 0) {
        this.logger.error(`Missing or empty visual_prompt [${operationId}]`);
        throw new BadRequestException(
          'visual_prompt is required and cannot be empty',
        );
      }

      if (!art_style || art_style.trim().length === 0) {
        this.logger.error(`Missing or empty art_style [${operationId}]`);
        throw new BadRequestException(
          'art_style is required and cannot be empty',
        );
      }

      if (visual_prompt.length > 2000) {
        this.logger.error(
          `Visual prompt too long: ${visual_prompt.length} characters [${operationId}]`,
        );
        throw new BadRequestException(
          'visual_prompt must be less than 2000 characters',
        );
      }

      // ===== CREDIT DEDUCTION =====
      this.logger.log(
        `Deducting credits for image generation (using higher-cost model pricing) [${operationId}]`,
      );

      // Deduct credits for the higher-cost model upfront (imagen: 2 credits)
      // We'll refund the difference if a lower-cost model (recraft: 1 credit) is used
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'IMAGE_GENERATION',
        'imagen', // Use higher-cost model for initial deduction
        operationId,
        false, // We'll handle edit calls separately later
        `Image generation with AI model`,
      );

      this.logger.log(
        `Successfully deducted credits for image generation. Transaction ID: ${creditTransactionId} [${operationId}]`,
      );
      // ===== END CREDIT DEDUCTION =====

      this.logger.log('Running triage agent to determine model selection');
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `Generate an image with prompt: "${visual_prompt}"\n art style: "${art_style}"\n for user: "${segmentId}"\n projectId: "${projectId}"\n segmentId: "${segmentId}"`,
        },
      ]);

      // Enhanced logging for agent execution results
      this.logger.log('=== AGENT EXECUTION ANALYSIS START ===');
      this.logger.log(`Operation ID: ${operationId}`);
      this.logger.log(`Agent execution completed`);
      this.logger.log(
        `Total agent execution time: ${Date.now() - startTime}ms`,
      );
      this.logger.log(
        `Result output array length: ${result.output?.length || 0}`,
      );

      // Log the sequence of agent calls
      const agentCalls =
        result.output?.filter((msg) => msg.type === 'function_call') || [];
      this.logger.log(`Number of function calls made: ${agentCalls.length}`);

      agentCalls.forEach((call, index) => {
        this.logger.log(`Call ${index + 1}: ${call.name} (${call.status})`);
      });

      // Identify which agent was selected
      const triageCall = agentCalls.find(
        (call) =>
          call.name === 'use_recraft_agent' || call.name === 'use_imagen_agent',
      );

      if (triageCall) {
        const selectedAgent =
          triageCall.name === 'use_recraft_agent' ? 'RECRAFT' : 'IMAGEN';
        this.logger.log(`=== TRIAGE DECISION: ${selectedAgent} SELECTED ===`);
        this.logger.log(
          `Decision based on prompt: "${visual_prompt?.substring(0, 100)}..."`,
        );
        this.logger.log(`Art style: "${art_style}"`);
      }

      // Check for any errors in the execution
      const errorCalls =
        result.output?.filter(
          (msg) =>
            msg.type === 'function_call_result' &&
            (msg as any).output?.type === 'text' &&
            (msg as any).output?.text?.includes('An error occurred'),
        ) || [];

      this.logger.log(`Number of error calls: ${errorCalls.length}`);
      errorCalls.forEach((error, index) => {
        this.logger.error(`Error ${index + 1}: ${(error as any).output?.text}`);
      });

      this.logger.log('=== AGENT EXECUTION ANALYSIS END ===');

      this.logger.debug('Agent execution completed, parsing result');
      console.log(result.output);

      // Check if the agent execution contains any errors
      const hasErrors = result.output.some(
        (msg) =>
          msg.type === 'function_call_result' &&
          msg.status === 'completed' &&
          (msg as any).output?.type === 'text' &&
          (msg as any).output?.text?.includes(
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
          contents: `Parse this entire agent conversation output and extract the image generation result ONLY if the agent execution was successful.

          IMPORTANT INSTRUCTIONS:
          - Only return values if they are real, valid data from successful agent execution
          - Do NOT create fake, placeholder, or example values like "fake-bucket", "fake-key", etc.
          - If no valid S3 key exists in the output, set s3_key to null
          - If no valid model name exists, set model to null  
          - If no valid image size exists, set image_size_bytes to null
          - Look for actual S3 keys in the format like "uuid/images/some-uuid.png" or similar valid paths
          - Look for actual model names like "recraft-realistic-image", "imagen-3.0-generate-002", "dall-e", etc.
          - Look for actual file sizes in bytes (should be > 10000 for real images)

          Full agent output:
          ${JSON.stringify(result.output, null, 2)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                s3_key: { type: ['string', 'null'] },
                model: { type: ['string', 'null'] },
                image_size_bytes: { type: ['number', 'null'] },
              },
              required: [],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);
        this.logger.debug('Parsed agent result:', agentResult);

        // Validate for fake or invalid data
        if (agentResult?.s3_key) {
          // Check for fake S3 keys
          if (
            agentResult.s3_key.includes('fake') ||
            agentResult.s3_key.includes('placeholder') ||
            agentResult.s3_key.includes('example') ||
            agentResult.s3_key === 's3://fake-bucket/fake-key'
          ) {
            this.logger.error(
              'Detected fake S3 key from agent result:',
              agentResult.s3_key,
            );
            throw new InternalServerErrorException(
              'Image generation failed - agent did not produce a valid S3 key',
            );
          }
        }

        if (
          agentResult?.image_size_bytes &&
          agentResult.image_size_bytes < 10000
        ) {
          this.logger.error(
            'Detected invalid/fake image size from agent result:',
            agentResult.image_size_bytes,
          );
          throw new InternalServerErrorException(
            'Image generation failed - invalid image size in response',
          );
        }

        // Check if we have valid data from the agent
        if (!agentResult?.s3_key || !agentResult?.model) {
          this.logger.error(
            'Agent execution did not produce valid image generation results',
            {
              hasS3Key: !!agentResult?.s3_key,
              hasModel: !!agentResult?.model,
              hasImageSize: !!agentResult?.image_size_bytes,
              agentResult,
            },
          );
          throw new InternalServerErrorException(
            'Image generation failed - agent did not produce a valid result. Please try again.',
          );
        }

        if (agentResult.s3_key && agentResult.model) {
          const totalTime = Date.now() - startTime;
          this.logger.log(
            `Image generation completed successfully in ${totalTime}ms`,
            {
              model: agentResult.model,
              s3_key: agentResult.s3_key,
              image_size_bytes: agentResult.image_size_bytes,
              uuid: segmentId,
            },
          );

          // Check which model was actually used and adjust credits if needed
          modelUsed = 'imagen'; // default fallback
          if (agentResult.model.toLowerCase().includes('recraft')) {
            modelUsed = 'recraft';

            // Refund 1 credit since recraft (1 credit) costs less than imagen (2 credits)
            try {
              await this.creditService.refundCredits(
                userId,
                'IMAGE_GENERATION',
                'imagen', // refund from the originally deducted model
                operationId,
                creditTransactionId,
                false,
                `Partial refund: used recraft (1 credit) instead of imagen (2 credits)`,
              );

              // Now deduct the correct amount for recraft
              creditTransactionId = await this.creditService.deductCredits(
                userId,
                'IMAGE_GENERATION',
                'recraft',
                operationId,
                false,
                `Image generation using recraft model`,
              );

              actualCreditsUsed = 1;
              this.logger.log(
                `Adjusted credits for recraft model usage [${operationId}]`,
              );
            } catch (adjustError) {
              this.logger.error(
                `Failed to adjust credits for recraft model: ${adjustError.message}`,
              );
              // Use imagen pricing as fallback
              actualCreditsUsed = 2;
            }
          } else {
            // Imagen was used, no adjustment needed
            actualCreditsUsed = 2;
          }

          // Save to database
          this.logger.log(`Saving image generation to database`);
          const savedImage = await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: segmentId,
              success: true,
              s3Key: agentResult.s3_key,
              model: agentResult.model,
              message: 'Image generated and uploaded successfully',
              imageSizeBytes: agentResult.image_size_bytes,
              projectId,
              userId,
              // Add credit tracking
              creditTransactionId: creditTransactionId,
              creditsUsed: new Decimal(actualCreditsUsed), // Store the actual credits used
            },
          });

          // Save conversation history
          await this.prisma.conversationHistory.create({
            data: {
              type: 'IMAGE_GENERATION',
              userInput: visual_prompt,
              response: JSON.stringify({
                success: true,
                s3_key: agentResult.s3_key,
                model: agentResult.model,
                message: 'Image generated and uploaded successfully',
                image_size_bytes: agentResult.image_size_bytes,
              }),
              metadata: {
                artStyle: art_style,
                uuid: segmentId,
                savedImageId: savedImage.id,
              },
              projectId,
              userId,
            },
          });

          this.logger.log(
            `Successfully saved image generation: ${savedImage.id}`,
          );

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            success: true,
            s3_key: agentResult.s3_key,
            model: agentResult.model,
            visual_prompt: visual_prompt,
            art_style: art_style,
            message: 'Image generated and uploaded successfully',
            image_size_bytes: agentResult.image_size_bytes,
            credits: {
              used: actualCreditsUsed,
              balance: newBalance.toNumber(),
            },
          };
        }
      } catch (parseError) {
        this.logger.error(
          'Failed to parse agent result with Gemini:',
          parseError,
        );
        throw new InternalServerErrorException(
          'Failed to parse image generation result. Please try again.',
        );
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Image generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid: segmentId,
        stack: error.stack,
      });

      // Refund credits if they were deducted
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'IMAGE_GENERATION',
            modelUsed || 'imagen',
            operationId,
            creditTransactionId,
            false,
            `Refund for failed image generation: ${error.message}`,
          );
          this.logger.log(
            `Successfully refunded ${actualCreditsUsed || 2} credits for failed image generation. User: ${userId}, Operation: ${operationId}`,
          );
        } catch (refundError) {
          this.logger.error(
            `Failed to refund credits for user ${userId}, operation ${operationId}:`,
            refundError,
          );
        }
      }

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

  /**
   * Update the visual prompt, art style, S3 key, and/or project of a specific generated image
   */
  async updateImagePrompt(
    imageId: string,
    updateData: UpdateImageGenDto,
    userId: string,
  ) {
    try {
      // First, verify the image exists and belongs to the user
      const existingImage = await this.prisma.generatedImage.findFirst({
        where: {
          id: imageId,
          userId,
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

      if (!existingImage) {
        throw new NotFoundException(
          `Generated image with ID ${imageId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {
        visualPrompt: updateData.visual_prompt,
        artStyle: updateData.art_style,
      };

      if (updateData.s3_key !== undefined) {
        updateFields.s3Key = updateData.s3_key;
      }
      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      const updatedImage = await this.prisma.generatedImage.update({
        where: {
          id: imageId,
        },
        data: updateFields,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Log the update in conversation history
      if (existingImage.projectId) {
        const userInputData: any = {
          action: 'update_image',
          imageId: imageId,
          newPrompt: updateData.visual_prompt,
          oldPrompt: existingImage.visualPrompt,
          newArtStyle: updateData.art_style,
          oldArtStyle: existingImage.artStyle,
          updatedFields: updateFields,
        };

        if (updateData.s3_key !== undefined) {
          userInputData.newS3Key = updateData.s3_key;
          userInputData.oldS3Key = existingImage.s3Key;
        }
        if (updateData.projectId !== undefined) {
          userInputData.newProjectId = updateData.projectId;
          userInputData.oldProjectId = existingImage.projectId;
        }

        await this.prisma.conversationHistory.create({
          data: {
            type: 'IMAGE_GENERATION',
            userInput: JSON.stringify(userInputData),
            response: JSON.stringify({
              success: true,
              message: 'Image updated successfully',
              updatedFields: Object.keys(updateFields),
            }),
            metadata: {
              action: 'update',
              imageId,
              updatedFields: Object.keys(updateFields),
            },
            projectId: updatedImage.projectId,
            userId: userId,
          },
        });
      }

      this.logger.log(
        `Updated image ${imageId} for user ${userId}: ${Object.keys(updateFields).join(', ')}`,
      );

      return {
        success: true,
        message: 'Image updated successfully',
        image: updatedImage,
      };
    } catch (error) {
      this.logger.error(`Failed to update image ${imageId}: ${error.message}`);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to update image: ${error.message}`,
      );
    }
  }
}
