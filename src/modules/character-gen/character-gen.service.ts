/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Agent, handoff, run } from '@openai/agents';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { createOpenAIEditAgent } from './agents/openai-edit.agent';
import { createRecraftImg2ImgAgent } from './agents/recraft-img2img.agent';
import { CreateCharacterDto } from './dto/create-character.dto';

@Injectable()
export class CharacterGenService {
  private readonly logger = new Logger(CharacterGenService.name);
  private readonly prisma = new PrismaClient();

  constructor(private readonly projectHelperService: ProjectHelperService) {
    try {
      // Validate environment variables
      if (!process.env.OPENAI_API_KEY) {
        this.logger.error('OPENAI_API_KEY environment variable not set');
        throw new Error('OPENAI_API_KEY environment variable not set');
      }

      if (!process.env.RECRAFT_API_KEY) {
        this.logger.error('RECRAFT_API_KEY environment variable not set');
        throw new Error('RECRAFT_API_KEY environment variable not set');
      }

      if (!process.env.S3_BUCKET_NAME) {
        this.logger.error('S3_BUCKET_NAME environment variable not set');
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      this.logger.log('CharacterGenService initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize CharacterGenService',
        (error as Error).stack,
      );
      throw error;
    }
  }

  async generateCharacter(
    createCharacterDto: CreateCharacterDto & { reference_images: string[] },
    userId: string,
  ) {
    // Ensure user has a project (create default if none exists)
    const projectId =
      await this.projectHelperService.ensureUserHasProject(userId);
    this.logger.log(`Using project ${projectId} for character generation`);

    const startTime = Date.now();
    const operationId = createCharacterDto.uuid;

    this.logger.log(`Starting character generation [${operationId}]`);
    this.logger.log(
      `Character generation with prompt: ${createCharacterDto.visual_prompt?.substring(0, 100)}... [${operationId}]`,
    );

    // Validate input
    if (
      !createCharacterDto.visual_prompt ||
      createCharacterDto.visual_prompt.trim().length === 0
    ) {
      this.logger.error(`Missing or empty visual_prompt [${operationId}]`);
      throw new BadRequestException(
        'visual_prompt is required and cannot be empty',
      );
    }

    if (
      !createCharacterDto.art_style ||
      createCharacterDto.art_style.trim().length === 0
    ) {
      this.logger.error(`Missing or empty art_style [${operationId}]`);
      throw new BadRequestException(
        'art_style is required and cannot be empty',
      );
    }

    if (
      !createCharacterDto.reference_images ||
      createCharacterDto.reference_images.length !== 6
    ) {
      this.logger.error(
        `Invalid number of reference images: ${createCharacterDto.reference_images?.length || 0} [${operationId}]`,
      );
      throw new BadRequestException('Exactly 6 reference images are required');
    }

    let characterGeneration: any = null;

    try {
      // Reference images are already uploaded by the client; use provided S3 keys
      const referenceImageS3Keys: string[] =
        createCharacterDto.reference_images;

      // Step 2: Create character generation record in database
      characterGeneration = await this.prisma.characterGeneration.create({
        data: {
          name: createCharacterDto.name,
          description: createCharacterDto.description,
          referenceImages: referenceImageS3Keys,
          visualPrompt: createCharacterDto.visual_prompt,
          artStyle: createCharacterDto.art_style,
          uuid: createCharacterDto.uuid,
          success: false,
          message: 'Character generation in progress',
          projectId,
          userId,
        },
      });

      // Step 3: Run character generation agents
      const OpenAIEditAgent = createOpenAIEditAgent();
      const RecraftImg2ImgAgent = createRecraftImg2ImgAgent();

      const characterGenAgent = Agent.create({
        name: 'Character Generation Orchestrator',
        model: 'gpt-3.5-turbo',
        instructions: `
        You are a character generation orchestrator that manages the entire character creation process.
        
        Process:
        1. Generate sprite sheet from reference images using OpenAI
        2. Generate final character using Recraft image-to-image
        
        Always ensure high-quality character generation with proper error handling.
        `,
        handoffs: [
          handoff(OpenAIEditAgent, {
            toolNameOverride: 'generate_sprite_sheet',
            toolDescriptionOverride:
              'Generate sprite sheet from reference images using OpenAI.',
          }),
          handoff(RecraftImg2ImgAgent, {
            toolNameOverride: 'generate_final_character',
            toolDescriptionOverride:
              'Generate final character using Recraft image-to-image.',
          }),
        ],
      });

      this.logger.log('Running character generation orchestrator');
      const result = await run(characterGenAgent, [
        {
          role: 'user',
          content: `Generate a character with:
            - Reference images: ${referenceImageS3Keys.join(', ')}
            - Visual prompt: "${createCharacterDto.visual_prompt}"
            - Art style: "${createCharacterDto.art_style}"
            - User: "${createCharacterDto.uuid}"`,
        },
      ]);

      this.logger.debug(
        'Character generation agent execution completed, parsing result',
      );

      // Validate agent result
      if (!result || !result.output || !Array.isArray(result.output)) {
        throw new InternalServerErrorException(
          'Agent orchestration failed - invalid result structure',
        );
      }

      // Parse agent result
      const agentResult = this.parseAgentResult(result.output);

      if (!agentResult) {
        throw new InternalServerErrorException(
          'Failed to parse agent result - invalid response format',
        );
      }

      if (
        agentResult?.sprite_sheet_s3_key &&
        agentResult?.final_character_s3_key
      ) {
        // Update database with results
        const updatedCharacter = await this.prisma.characterGeneration.update({
          where: { id: characterGeneration.id },
          data: {
            spriteSheetS3Key: agentResult.sprite_sheet_s3_key,
            finalCharacterS3Key: agentResult.final_character_s3_key,
            success: true,
            model: 'gpt-image-1-recraft-character-gen',
            message: 'Character generated successfully',
          },
        });

        // Save conversation history
        await this.prisma.conversationHistory.create({
          data: {
            type: 'CHARACTER_GENERATION',
            userInput: createCharacterDto.visual_prompt,
            response: JSON.stringify({
              success: true,
              sprite_sheet_s3_key: agentResult.sprite_sheet_s3_key,
              final_character_s3_key: agentResult.final_character_s3_key,
              model: 'gpt-image-1-recraft-character-gen',
              message: 'Character generated successfully',
            }),
            metadata: {
              artStyle: createCharacterDto.art_style,
              uuid: createCharacterDto.uuid,
              characterGenerationId: updatedCharacter.id,
            },
            projectId,
            userId,
          },
        });

        const totalTime = Date.now() - startTime;
        this.logger.log(
          `Character generation completed successfully in ${totalTime}ms`,
          {
            characterId: updatedCharacter.id,
            sprite_sheet_s3_key: agentResult.sprite_sheet_s3_key,
            final_character_s3_key: agentResult.final_character_s3_key,
            uuid: createCharacterDto.uuid,
          },
        );

        return {
          success: true,
          character_id: updatedCharacter.id,
          sprite_sheet_s3_key: agentResult.sprite_sheet_s3_key,
          final_character_s3_key: agentResult.final_character_s3_key,
          model: 'gpt-image-1-recraft-character-gen',
          message: 'Character generated successfully',
        };
      } else {
        throw new InternalServerErrorException(
          'Character generation completed but no valid results were produced.',
        );
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Character generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid: createCharacterDto.uuid,
        stack: error.stack,
      });

      // Update database with error
      await this.prisma.characterGeneration.update({
        where: { id: characterGeneration.id },
        data: {
          success: false,
          message: error.message || 'Character generation failed',
        },
      });

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        error.message || 'Failed to generate character.',
      );
    }
  }

  private parseAgentResult(output: any[]): any {
    try {
      const result = {
        sprite_sheet_s3_key: null,
        final_character_s3_key: null,
      };

      // More robust parsing logic
      for (const msg of output) {
        if (msg.type === 'function_call_result' && msg.status === 'completed') {
          const outputData = msg.output;

          if (outputData?.s3_key) {
            // Check model name to determine which agent produced the result
            const model = outputData.model?.toLowerCase() || '';

            if (
              model.includes('gpt-image-1') ||
              model.includes('openai') ||
              model.includes('sprite')
            ) {
              result.sprite_sheet_s3_key = outputData.s3_key;
              this.logger.debug(
                `Found sprite sheet S3 key: ${outputData.s3_key}`,
              );
            } else if (
              model.includes('recraft') ||
              model.includes('final') ||
              model.includes('character')
            ) {
              result.final_character_s3_key = outputData.s3_key;
              this.logger.debug(
                `Found final character S3 key: ${outputData.s3_key}`,
              );
            }
          }
        }
      }

      // Validate that we have both results
      if (!result.sprite_sheet_s3_key) {
        this.logger.error('No sprite sheet S3 key found in agent result');
      }
      if (!result.final_character_s3_key) {
        this.logger.error('No final character S3 key found in agent result');
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to parse agent result:', error);
      return null;
    }
  }

  async getAllCharacters(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const characters = await this.prisma.characterGeneration.findMany({
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
        `Retrieved ${characters.length} character generations for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: characters.length,
        characters,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve characters: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve characters: ${error.message}`,
      );
    }
  }

  async getCharacterById(characterId: string, userId: string) {
    try {
      const character = await this.prisma.characterGeneration.findFirst({
        where: {
          id: characterId,
          userId, // Ensure user can only access their own characters
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

      if (!character) {
        throw new NotFoundException(
          `Character generation with ID ${characterId} not found or you don't have access to it`,
        );
      }

      this.logger.log(
        `Retrieved character generation ${characterId} for user ${userId}`,
      );

      return {
        success: true,
        character,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve character ${characterId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve character: ${error.message}`,
      );
    }
  }
}
