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
import { run } from '@openai/agents';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { createOpenAIEditAgent } from './agents/openai-edit.agent';
import { createRecraftImg2ImgAgent } from './agents/recraft-img2img.agent';
import { getS3ImageUrl } from './agents/s3.service';
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

      // Step 3: Run character generation agents sequentially
      this.logger.log('Starting sequential character generation process');

      // Step 3a: Generate sprite sheet using OpenAI
      this.logger.log('Step 1: Generating sprite sheet with OpenAI');
      const OpenAIEditAgent = createOpenAIEditAgent();
      const spriteSheetResult = await run(OpenAIEditAgent, [
        {
          role: 'user',
          content: `Generate a sprite sheet with:
            - Reference images: ${referenceImageS3Keys.join(', ')}
            - Visual prompt: "${createCharacterDto.visual_prompt}"
            - Art style: "${createCharacterDto.art_style}"
            - User: "${createCharacterDto.uuid}"`,
        },
      ]);

      this.logger.debug(
        'Sprite sheet generation result:',
        JSON.stringify(spriteSheetResult, null, 2),
      );
      
      // Add more detailed debugging
      this.logger.debug('Result type:', typeof spriteSheetResult);
      this.logger.debug('Result keys:', Object.keys(spriteSheetResult || {}));
      if (spriteSheetResult?.output) {
        this.logger.debug('Output array length:', spriteSheetResult.output.length);
        this.logger.debug('Output array:', JSON.stringify(spriteSheetResult.output, null, 2));
      }

      // Parse sprite sheet result
      const spriteSheetS3Key = this.parseSpriteSheetResult(spriteSheetResult);
      if (!spriteSheetS3Key) {
        throw new InternalServerErrorException(
          'Failed to generate sprite sheet',
        );
      }

      this.logger.log(
        `Sprite sheet generated successfully: ${spriteSheetS3Key}`,
      );

      // Step 3b: Generate final character using Recraft
      this.logger.log('Step 2: Generating final character with Recraft');
      const RecraftImg2ImgAgent = createRecraftImg2ImgAgent();
      const finalCharacterResult = await run(RecraftImg2ImgAgent, [
        {
          role: 'user',
          content: `Generate a final character with:
            - Sprite sheet S3 key: "${spriteSheetS3Key}"
            - Visual prompt: "${createCharacterDto.visual_prompt}"
            - Art style: "${createCharacterDto.art_style}"
            - User: "${createCharacterDto.uuid}"`,
        },
      ]);

      this.logger.debug(
        'Final character generation result:',
        JSON.stringify(finalCharacterResult, null, 2),
      );

      // Parse final character result
      const finalCharacterS3Key = this.parseFinalCharacterResult(
        finalCharacterResult,
      );
      if (!finalCharacterS3Key) {
        throw new InternalServerErrorException(
          'Failed to generate final character',
        );
      }

      this.logger.log(
        `Final character generated successfully: ${finalCharacterS3Key}`,
      );

      // Combine results
      const result = {
        output: [
          {
            type: 'function_call_result',
            status: 'completed',
            output: {
              s3_key: spriteSheetS3Key,
              model: 'gpt-image-1-sprite-sheet',
            },
          },
          {
            type: 'function_call_result',
            status: 'completed',
            output: {
              s3_key: finalCharacterS3Key,
              model: 'recraft-image-to-image',
            },
          },
        ],
      };

      this.logger.debug(
        'Character generation agent execution completed, parsing result',
      );

      this.logger.debug(
        'Agent result structure:',
        JSON.stringify(result, null, 2),
      );

      // Validate agent result
      if (!result || !result.output || !Array.isArray(result.output)) {
        this.logger.error(
          'Invalid agent result structure:',
          JSON.stringify(result, null, 2),
        );
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
          sprite_sheet_url: getS3ImageUrl(agentResult.sprite_sheet_s3_key),
          final_character_url: getS3ImageUrl(
            agentResult.final_character_s3_key,
          ),
          model: 'gpt-image-1-recraft-character-gen',
          message: 'Character generated successfully',
          video_generation_ready: true,
          video_generation_endpoint: `/character-gen/${updatedCharacter.id}/generate-video`,
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

  private findS3KeyRecursive(obj: any): string | null {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    // Direct hit
    if (typeof obj.s3_key === 'string' && obj.s3_key.length > 0) {
      return obj.s3_key as string;
    }

    // If the object is an array, iterate its items
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const key = this.findS3KeyRecursive(item);
        if (key) {
          return key;
        }
      }
      return null;
    }

    // Otherwise, iterate object properties
    for (const value of Object.values(obj)) {
      const key = this.findS3KeyRecursive(value);
      if (key) {
        return key;
      }
    }

    return null;
  }

  private parseSpriteSheetResult(result: any): string | null {
    try {
      this.logger.debug('Parsing sprite sheet result:', JSON.stringify(result, null, 2));

      // 1. Attempt previously-supported shapes first
      if (result?.s3_key) {
        this.logger.debug(`Found sprite sheet S3 key: ${result.s3_key}`);
        return result.s3_key;
      }

      if (result?.output && Array.isArray(result.output)) {
        for (const msg of result.output) {
          if (msg.type === 'function_call_result' && msg.status === 'completed') {
            const outputData = msg.output;
            if (outputData?.s3_key) {
              this.logger.debug(`Found sprite sheet S3 key: ${outputData.s3_key}`);
              return outputData.s3_key;
            }
          }
        }
      }

      // 2. Fallback: deep recursive search for any s3_key
      const recursiveKey = this.findS3KeyRecursive(result);
      if (recursiveKey) {
        this.logger.debug(
          'Found sprite sheet S3 key via recursive search:',
          recursiveKey,
        );
        return recursiveKey;
      }

      this.logger.error('No sprite sheet S3 key found in result');
      return null;
    } catch (error) {
      this.logger.error('Failed to parse sprite sheet result:', error);
      return null;
    }
  }

  private parseFinalCharacterResult(result: any): string | null {
    try {
      this.logger.debug('Parsing final character result:', JSON.stringify(result, null, 2));

      if (result?.s3_key) {
        this.logger.debug(`Found final character S3 key: ${result.s3_key}`);
        return result.s3_key;
      }

      if (result?.output && Array.isArray(result.output)) {
        for (const msg of result.output) {
          if (msg.type === 'function_call_result' && msg.status === 'completed') {
            const outputData = msg.output;
            if (outputData?.s3_key) {
              this.logger.debug(`Found final character S3 key: ${outputData.s3_key}`);
              return outputData.s3_key;
            }
          }
        }
      }

      // Fallback: deep recursive search
      const recursiveKey = this.findS3KeyRecursive(result);
      if (recursiveKey) {
        this.logger.debug(
          'Found final character S3 key via recursive search:',
          recursiveKey,
        );
        return recursiveKey;
      }

      this.logger.error('No final character S3 key found in result');
      return null;
    } catch (error) {
      this.logger.error('Failed to parse final character result:', error);
      return null;
    }
  }

  private parseAgentResult(output: any[]): any {
    try {
      const result = {
        sprite_sheet_s3_key: null,
        final_character_s3_key: null,
      };

      this.logger.debug(
        'Parsing agent result output:',
        JSON.stringify(output, null, 2),
      );

      // More robust parsing logic
      for (const msg of output) {
        this.logger.debug('Processing message:', JSON.stringify(msg, null, 2));

        if (msg.type === 'function_call_result' && msg.status === 'completed') {
          const outputData = msg.output;
          this.logger.debug(
            'Function call result output:',
            JSON.stringify(outputData, null, 2),
          );

          if (outputData?.s3_key) {
            // Check model name to determine which agent produced the result
            const model = outputData.model?.toLowerCase() || '';
            this.logger.debug(`Processing result with model: ${model}`);

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
              model.includes('image-to-image') ||
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

      this.logger.debug(
        'Final parsed result:',
        JSON.stringify(result, null, 2),
      );
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

      const charactersWithUrls = characters.map(character => ({
        ...character,
        sprite_sheet_url: character.spriteSheetS3Key 
          ? getS3ImageUrl(character.spriteSheetS3Key)
          : null,
        final_character_url: character.finalCharacterS3Key
          ? getS3ImageUrl(character.finalCharacterS3Key)
          : null,
        video_generation_ready: !!character.finalCharacterS3Key,
        video_generation_endpoint: character.finalCharacterS3Key 
          ? `/character-gen/${character.id}/generate-video`
          : null,
      }));

      return {
        success: true,
        count: characters.length,
        characters: charactersWithUrls,
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
        video_generation_ready: !!character.finalCharacterS3Key,
        video_generation_endpoint: character.finalCharacterS3Key
          ? `/character-gen/${character.id}/generate-video`
          : null,
        sprite_sheet_url: character.spriteSheetS3Key
          ? getS3ImageUrl(character.spriteSheetS3Key)
          : null,
        final_character_url: character.finalCharacterS3Key
          ? getS3ImageUrl(character.finalCharacterS3Key)
          : null,
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
