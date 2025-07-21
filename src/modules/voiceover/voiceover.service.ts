import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VoiceoverDto } from './dto/voiceover.dto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';

@Injectable()
export class VoiceoverService {
  private readonly logger = new Logger(VoiceoverService.name);
  private readonly elevenLabs: ElevenLabsClient;
  private readonly s3: S3Client;
  private readonly bucketName = process.env.S3_BUCKET_NAME;
  private readonly prisma = new PrismaClient();

  constructor(private readonly projectHelperService: ProjectHelperService) {
    try {
      // Validate environment variables
      if (!process.env.ELEVENLABS_API_KEY) {
        this.logger.error('ELEVENLABS_API_KEY environment variable not set');
        throw new Error('ELEVENLABS_API_KEY environment variable not set');
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

      this.elevenLabs = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      });

      this.s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      this.logger.log('VoiceoverService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize VoiceoverService', error.stack);
      throw error;
    }
  }

  async generateVoiceover(voiceoverDto: VoiceoverDto, userId: string) {
    const projectId =
      await this.projectHelperService.ensureUserHasProject(userId);
    this.logger.log(`Using project ${projectId} for voiceover generation`);

    const operationId = randomUUID();

    try {
      this.logger.log(`Starting voiceover generation [${operationId}]`);

      if (
        !voiceoverDto.narration_prompt ||
        voiceoverDto.narration_prompt.trim().length === 0
      ) {
        this.logger.error(`Missing or empty narration_prompt [${operationId}]`);
        throw new BadRequestException(
          'narration_prompt is required and cannot be empty',
        );
      }

      if (voiceoverDto.narration_prompt.length > 5000) {
        this.logger.error(
          `Narration prompt too long: ${voiceoverDto.narration_prompt.length} characters [${operationId}]`,
        );
        throw new BadRequestException(
          'narration_prompt must be less than 5000 characters',
        );
      }

      this.logger.log(`Generating audio with ElevenLabs [${operationId}]`);

      const stream = await this.elevenLabs.textToSpeech.convert(
        'JBFqnCBsd6RMkjVDRZzb',
        {
          text: voiceoverDto.narration_prompt,
          modelId: 'eleven_multilingual_v2',
          outputFormat: 'mp3_44100_128',
        },
      );

      this.logger.log(`Converting audio stream to buffer [${operationId}]`);
      const audioBuffer = await this.streamToBuffer(stream);

      if (!audioBuffer || audioBuffer.length === 0) {
        this.logger.error(`Empty audio buffer received [${operationId}]`);
        throw new InternalServerErrorException(
          'Failed to generate audio: empty response from ElevenLabs',
        );
      }

      const s3Key = `voiceovers/${randomUUID()}.mp3`;
      this.logger.log(`Uploading to S3 with key: ${s3Key} [${operationId}]`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: audioBuffer,
        ContentLength: audioBuffer.length,
        ContentType: 'audio/mpeg',
      });

      await this.s3.send(command);

      this.logger.log(`Saving voiceover to database [${operationId}]`);

      const savedVoiceover = await this.prisma.generatedVoiceover.create({
        data: {
          narrationPrompt: voiceoverDto.narration_prompt,
          s3Key: s3Key,
          projectId,
          userId,
        },
      });

      await this.prisma.conversationHistory.create({
        data: {
          type: 'VOICEOVER_GENERATION',
          userInput: voiceoverDto.narration_prompt,
          response: JSON.stringify({
            success: true,
            s3_key: s3Key,
            message: 'Voiceover generated and uploaded successfully',
            audio_size_bytes: audioBuffer.length,
          }),
          metadata: {
            voiceId: 'JBFqnCBsd6RMkjVDRZzb',
            model: 'eleven_multilingual_v2',
            audioSizeBytes: audioBuffer.length,
            savedVoiceoverId: savedVoiceover.id,
          },
          projectId,
          userId,
        },
      });

      this.logger.log(
        `Successfully saved voiceover to database: ${savedVoiceover.id} [${operationId}]`,
      );

      this.logger.log(
        `Voiceover generation completed successfully [${operationId}]`,
      );
      return {
        success: true,
        s3_key: s3Key,
        message: 'Voiceover generated and uploaded successfully',
        audio_size_bytes: audioBuffer.length,
      };
    } catch (error) {
      this.logger.error(`Voiceover generation failed [${operationId}]`, {
        error: error.message,
        stack: error.stack,
        promptLength: voiceoverDto.narration_prompt?.length || 0,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle ElevenLabs specific errors
      if (
        error.message?.includes('quota') ||
        error.message?.includes('limit') ||
        error.message?.includes('credits')
      ) {
        throw new InternalServerErrorException(
          'ElevenLabs API quota exceeded. Please try again later.',
        );
      }

      if (
        error.message?.includes('unauthorized') ||
        error.message?.includes('authentication') ||
        error.message?.includes('API key')
      ) {
        throw new InternalServerErrorException(
          'ElevenLabs API authentication failed. Please contact support.',
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
        'Failed to generate voiceover. Please try again later.',
      );
    }
  }

  private async streamToBuffer(
    stream: ReadableStream<Uint8Array>,
  ): Promise<Buffer> {
    try {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error('Failed to convert stream to buffer', error.stack);
      throw new InternalServerErrorException('Failed to process audio stream');
    }
  }

  /**
   * Get all generated voiceovers for a user, optionally filtered by project
   */
  async getAllVoiceovers(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const voiceovers = await this.prisma.generatedVoiceover.findMany({
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
        `Retrieved ${voiceovers.length} generated voiceovers for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: voiceovers.length,
        voiceovers,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve voiceovers: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve voiceovers: ${error.message}`,
      );
    }
  }

  /**
   * Get a specific generated voiceover by ID for a user
   */
  async getVoiceoverById(voiceoverId: string, userId: string) {
    try {
      const voiceover = await this.prisma.generatedVoiceover.findFirst({
        where: {
          id: voiceoverId,
          userId, // Ensure user can only access their own voiceovers
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

      if (!voiceover) {
        throw new NotFoundException(
          `Generated voiceover with ID ${voiceoverId} not found or you don't have access to it`,
        );
      }

      this.logger.log(
        `Retrieved generated voiceover ${voiceoverId} for user ${userId}`,
      );

      return {
        success: true,
        voiceover,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve voiceover ${voiceoverId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve voiceover: ${error.message}`,
      );
    }
  }

  /**
   * Update the narration prompt of a specific generated voiceover
   */
  async updateVoiceoverPrompt(
    voiceoverId: string,
    newPrompt: string,
    userId: string,
    newS3Key?: string,
  ) {
    try {
      // First, verify the voiceover exists and belongs to the user
      const existingVoiceover = await this.prisma.generatedVoiceover.findFirst({
        where: {
          id: voiceoverId,
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

      if (!existingVoiceover) {
        throw new NotFoundException(
          `Generated voiceover with ID ${voiceoverId} not found or you don't have access to it`,
        );
      }

      // Update the narration prompt and optionally the S3 key
      const updateData: any = {
        narrationPrompt: newPrompt,
      };

      if (newS3Key !== undefined) {
        updateData.s3Key = newS3Key;
      }

      const updatedVoiceover = await this.prisma.generatedVoiceover.update({
        where: {
          id: voiceoverId,
        },
        data: updateData,
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
      if (existingVoiceover.projectId) {
        const userInputData: any = {
          action: 'update_prompt',
          voiceoverId: voiceoverId,
          newPrompt: newPrompt,
          oldPrompt: existingVoiceover.narrationPrompt,
        };

        if (newS3Key !== undefined) {
          userInputData.newS3Key = newS3Key;
          userInputData.oldS3Key = existingVoiceover.s3Key;
        }

        await this.prisma.conversationHistory.create({
          data: {
            type: 'VOICEOVER_GENERATION',
            userInput: JSON.stringify(userInputData),
            response: JSON.stringify({
              success: true,
              message: newS3Key
                ? 'Voiceover prompt and S3 key updated successfully'
                : 'Voiceover prompt updated successfully',
            }),
            projectId: existingVoiceover.projectId,
            userId: userId,
          },
        });
      }

      this.logger.log(
        `Updated narration prompt${newS3Key ? ' and S3 key' : ''} for voiceover ${voiceoverId} for user ${userId}`,
      );

      return {
        success: true,
        message: newS3Key
          ? 'Voiceover prompt and S3 key updated successfully'
          : 'Voiceover prompt updated successfully',
        voiceover: updatedVoiceover,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update voiceover prompt${newS3Key ? ' and S3 key' : ''} ${voiceoverId}: ${(error as Error).message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to update voiceover prompt${newS3Key ? ' and S3 key' : ''}: ${(error as Error).message}`,
      );
    }
  }
}
