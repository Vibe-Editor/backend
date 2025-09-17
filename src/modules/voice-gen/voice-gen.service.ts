import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreditService } from '../credits/credit.service';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { uploadAudioToS3 } from '../video-gen/s3/s3.service';
import { CreateVoiceGenDto } from './dto/create-voice-gen.dto';

const logger = new Logger('VoiceGenService');

@Injectable()
export class VoiceGenService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();
  private readonly elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });

  constructor(private readonly creditService: CreditService) {}

  async generateVoice(createVoiceGenDto: CreateVoiceGenDto, userId: string) {
    const {
      narration,
      segmentId,
      projectId,
      voiceId = 'JBFqnCBsd6RMkjVDRZzb',
      modelId = 'eleven_multilingual_v2',
      isEditCall = false,
      speed,
      stability,
      similarityBoost,
      styleExaggeration,
      useSpeakerBoost,
    } = createVoiceGenDto;

    let creditTransactionId: string | null = null;

    try {
      await this.validateProject(projectId, userId);

      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'VOICE_CLIP_GENERATION',
        'elevenlabs',
        segmentId,
        isEditCall,
        `Voice generation using ElevenLabs`,
      );

      const voiceSettings: any = {};
      
      if (speed !== undefined) voiceSettings.speed = speed;
      if (stability !== undefined) voiceSettings.stability = stability;
      if (similarityBoost !== undefined) voiceSettings.similarity_boost = similarityBoost;
      if (styleExaggeration !== undefined) voiceSettings.style_exaggeration = styleExaggeration;
      if (useSpeakerBoost !== undefined) voiceSettings.use_speaker_boost = useSpeakerBoost;

      const requestOptions: any = {
        text: narration,
        modelId,
        outputFormat: 'mp3_44100_128',
      };

      if (Object.keys(voiceSettings).length > 0) {
        requestOptions.voice_settings = voiceSettings;
      }

      const audioStream = await this.elevenlabs.textToSpeech.convert(voiceId, requestOptions);

      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      const s3Key = await uploadAudioToS3(audioBuffer, segmentId, projectId);

      const savedAudio = await this.prisma.generatedVoiceover.create({
        data: {
          narrationPrompt: narration,
          s3Key,
          projectId,
          userId,
          creditsUsed: 10,
          creditTransactionId,
        },
      });

      const newBalance = await this.creditService.getUserBalance(userId);

      logger.log(
        `Successfully generated voice for user ${userId}, operation ${segmentId}`,
      );

      return {
        id: savedAudio.id,
        s3_key: s3Key,
        model: modelId,
        audio_size_bytes: audioBuffer.length,
        credits: {
          used: 10,
          balance: newBalance.toNumber(),
        },
      };
    } catch (error) {
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'VOICE_CLIP_GENERATION',
            'elevenlabs',
            segmentId,
            creditTransactionId,
            isEditCall,
            `Refund for failed voice generation: ${error.message}`,
          );
          logger.log(
            `Successfully refunded 10 credits for failed voice generation. User: ${userId}, Operation: ${segmentId}`,
          );
        } catch (refundError) {
          logger.error(
            `Failed to refund credits for user ${userId}, operation ${segmentId}:`,
            refundError,
          );
        }
      }

      logger.error(
        `Voice generation failed for user ${userId}, operation ${segmentId}: ${(error as Error).message}`,
      );

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        (error as Error).message || 'Failed to generate voice.',
      );
    }
  }

  async getVoiceHistory(userId: string, projectId?: string) {
    const where: any = { userId };
    if (projectId) {
      where.projectId = projectId;
    }

    return this.prisma.generatedVoiceover.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        narrationPrompt: true,
        s3Key: true,
        creditsUsed: true,
        createdAt: true,
        projectId: true,
      },
    });
  }

  async getVoiceById(id: string, userId: string) {
    const voice = await this.prisma.generatedVoiceover.findFirst({
      where: { id, userId },
    });

    if (!voice) {
      throw new BadRequestException('Voice generation not found');
    }

    return voice;
  }

  private async validateProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new BadRequestException('Project not found or does not belong to user');
    }
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
