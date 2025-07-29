import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '../../../generated/prisma';
import { CreditService } from '../credits/credit.service';
import { recraftImageGen } from './image-generation/recraft.model';
import { ChatDto } from './dto/chat.dto';
import { imagenImageGen } from './image-generation/imagen.model';
import { klingVideoGen } from './video-generation/kling.model';
import { runwayVideoGen } from './video-generation/runway.model';

const logger = new Logger('ChatService');

@Injectable()
export class ChatService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  constructor(private readonly creditService: CreditService) {}

  async chat(chatDto: ChatDto, authenticatedUserId?: string) {
    const {
      model,
      gen_type,
      uuid,
      visual_prompt,
      animation_prompt,
      image_s3_key,
      art_style,
      projectId,
    } = chatDto;

    // Use authenticated user ID if available, fallback to uuid for backward compatibility
    const userId = authenticatedUserId || uuid;

    let creditTransactionId: string | null = null;
    if (gen_type === 'image') {
      if (model === 'recraft-v3') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'IMAGE_GENERATION',
            'recraft',
            uuid,
            false,
            `Image generation using recraft-v3 model`,
          );

          const image = await recraftImageGen(uuid, visual_prompt, art_style);

          // Save to database
          const savedImage = await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: uuid,
              success: true,
              s3Key: image.s3_key,
              model: image.model,
              imageSizeBytes: image.image_size_bytes,
              projectId: projectId,
              userId: uuid,
              creditsUsed: 1,
              creditTransactionId: creditTransactionId,
            },
          });

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            ...image,
            credits: {
              used: 1,
              balance: newBalance.toNumber(),
            },
          };
        } catch (error) {
          // Save failed attempt to database only if user exists
          try {
            await this.prisma.generatedImage.create({
              data: {
                visualPrompt: visual_prompt,
                artStyle: art_style,
                uuid: uuid,
                success: false,
                model: model,
                message: error.message,
                projectId: projectId,
                userId: userId,
                creditsUsed: creditTransactionId ? 1 : 0,
                creditTransactionId: creditTransactionId,
              },
            });
          } catch (dbError) {
            logger.error(
              `Failed to save error record to database: ${dbError.message}`,
            );
          }
          throw new Error('Failed to generate image');
        }
      } else if (model === 'imagen') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'IMAGE_GENERATION',
            'imagen',
            uuid,
            false,
            `Image generation using imagen model`,
          );

          const image = await imagenImageGen(uuid, visual_prompt, art_style);

          // Save to database
          const savedImage = await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: uuid,
              success: true,
              s3Key: image.s3_key,
              model: image.model,
              imageSizeBytes: image.image_size_bytes,
              projectId: projectId,
              userId: uuid,
              creditsUsed: 2,
              creditTransactionId: creditTransactionId,
            },
          });

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            ...image,
            credits: {
              used: 2,
              balance: newBalance.toNumber(),
            },
          };
        } catch (error) {
          // Save failed attempt to database only if user exists
          try {
            await this.prisma.generatedImage.create({
              data: {
                visualPrompt: visual_prompt,
                artStyle: art_style,
                uuid: uuid,
                success: false,
                model: model,
                message: error.message,
                projectId: projectId,
                userId: userId,
                creditsUsed: creditTransactionId ? 2 : 0,
                creditTransactionId: creditTransactionId,
              },
            });
          } catch (dbError) {
            logger.error(
              `Failed to save error record to database: ${dbError.message}`,
            );
          }
          throw new Error('Failed to generate image');
        }
      }
    } else if (gen_type === 'video') {
      if (!image_s3_key) {
        throw new BadRequestException(
          'imageS3Key is required for video generation',
        );
      }

      if (model === 'kling-v2.1-master') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'VIDEO_GENERATION',
            'kling',
            uuid,
            false,
            `Video generation using kling-v2.1-master model`,
          );

          const video = await klingVideoGen(
            uuid,
            animation_prompt,
            art_style,
            image_s3_key,
          );

          // Save to database
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: uuid,
              success: true,
              model: video.model,
              totalVideos: 1,
              projectId: projectId,
              userId: uuid,
              creditsUsed: 20,
              creditTransactionId: creditTransactionId,
            },
          });

          // Save video file
          await this.prisma.generatedVideoFile.create({
            data: {
              s3Key: video.s3_key,
              generatedVideoId: savedVideo.id,
            },
          });

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            ...video,
            credits: {
              used: 20,
              balance: newBalance.toNumber(),
            },
          };
        } catch (error) {
          // Save failed attempt to database only if user exists
          try {
            await this.prisma.generatedVideo.create({
              data: {
                animationPrompt: animation_prompt,
                artStyle: art_style,
                imageS3Key: image_s3_key,
                uuid: uuid,
                success: false,
                model: model,
                projectId: projectId,
                userId: userId,
                creditsUsed: creditTransactionId ? 20 : 0,
                creditTransactionId: creditTransactionId,
              },
            });
          } catch (dbError) {
            logger.error(
              `Failed to save error record to database: ${dbError.message}`,
            );
          }
          throw new Error('Failed to generate video');
        }
      } else if (model === 'gen4_turbo') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'VIDEO_GENERATION',
            'runwayml',
            uuid,
            false,
            `Video generation using gen4_turbo model`,
          );

          const video = await runwayVideoGen(
            uuid,
            animation_prompt,
            art_style,
            image_s3_key,
          );

          // Save to database
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: uuid,
              success: true,
              model: video.model,
              totalVideos: 1,
              projectId: projectId,
              userId: uuid,
              creditsUsed: 2.5,
              creditTransactionId: creditTransactionId,
            },
          });

          // Save video file
          await this.prisma.generatedVideoFile.create({
            data: {
              s3Key: video.s3_key,
              generatedVideoId: savedVideo.id,
            },
          });

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            ...video,
            credits: {
              used: 2.5,
              balance: newBalance.toNumber(),
            },
          };
        } catch (error) {
          // Save failed attempt to database only if user exists
          try {
            await this.prisma.generatedVideo.create({
              data: {
                animationPrompt: animation_prompt,
                artStyle: art_style,
                imageS3Key: image_s3_key,
                uuid: uuid,
                success: false,
                model: model,
                projectId: projectId,
                userId: userId,
                creditsUsed: creditTransactionId ? 2.5 : 0,
                creditTransactionId: creditTransactionId,
              },
            });
          } catch (dbError) {
            logger.error(
              `Failed to save error record to database: ${dbError.message}`,
            );
          }
          throw new Error('Failed to generate video');
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
