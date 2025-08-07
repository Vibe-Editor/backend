import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleDestroy,
  InternalServerErrorException,
  NotFoundException,
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

  private async validateProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    console.log(projectId, userId);
    if (!project) {
      throw new NotFoundException('Project not found or does not belong to user');
    }
  }

  async chat(chatDto: ChatDto, authenticatedUserId?: string) {
    const {
      model,
      gen_type,
      segmentId,
      visual_prompt,
      animation_prompt,
      image_s3_key,
      art_style,
      projectId,
    } = chatDto;

    // Use authenticated user ID if available, fallback to segmentId for backward compatibility
    const userId = authenticatedUserId || segmentId;

    // Validate project exists and belongs to user
    await this.validateProject(projectId, userId);

    let creditTransactionId: string | null = null;
    if (gen_type === 'image') {
      if (model === 'recraft-v3') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'IMAGE_GENERATION',
            'recraft',
            segmentId,
            false,
            `Image generation using recraft-v3 model`,
          );

          const image = await recraftImageGen(segmentId, visual_prompt, art_style, projectId);

          // Save to database
          await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: segmentId,
              success: true,
              s3Key: image.s3_key,
              model: image.model,
              imageSizeBytes: image.image_size_bytes,
              projectId: projectId,
              userId: userId,
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
          // Refund credits if they were deducted
          if (creditTransactionId) {
            try {
              await this.creditService.refundCredits(
                userId,
                'IMAGE_GENERATION',
                'recraft',
                segmentId,
                creditTransactionId,
                false,
                `Refund for failed image generation: ${error.message}`,
              );
              logger.log(
                `Successfully refunded 1 credit for failed recraft generation. User: ${userId}, Operation: ${segmentId}`,
              );
            } catch (refundError) {
              logger.error(
                `Failed to refund credits for user ${userId}, operation ${segmentId}:`,
                refundError,
              );
            }
          }

          // Log the error for debugging purposes
          logger.error(
            `Image generation failed for user ${userId}, operation ${segmentId}: ${(error as Error).message}`,
          );

          // If it's a known NestJS exception, rethrow it
          if (
            error instanceof BadRequestException ||
            error instanceof InternalServerErrorException ||
            error instanceof NotFoundException
          ) {
            throw error;
          }

          // Otherwise, throw the original error message as an internal server error
          throw new InternalServerErrorException(
            (error as Error).message || 'Failed to generate image.',
          );
        }
      } else if (model === 'imagen') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'IMAGE_GENERATION',
            'imagen',
            segmentId,
            false,
            `Image generation using imagen model`,
          );

          const image = await imagenImageGen(segmentId, visual_prompt, art_style, projectId);

          // Save to database
          await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: segmentId,
              success: true,
              s3Key: image.s3_key,
              model: image.model,
              imageSizeBytes: image.image_size_bytes,
              projectId: projectId,
              userId: userId,
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
          // Refund credits if they were deducted
          if (creditTransactionId) {
            try {
              await this.creditService.refundCredits(
                userId,
                'IMAGE_GENERATION',
                'imagen',
                segmentId,
                creditTransactionId,
                false,
                `Refund for failed image generation: ${error.message}`,
              );
              logger.log(
                `Successfully refunded 2 credits for failed imagen generation. User: ${userId}, Operation: ${segmentId}`,
              );
            } catch (refundError) {
              logger.error(
                `Failed to refund credits for user ${userId}, operation ${segmentId}:`,
                refundError,
              );
            }
          }

          // Log the error for debugging purposes
          logger.error(
            `Image generation failed for user ${userId}, operation ${segmentId}: ${(error as Error).message}`,
          );

          // If it's a known NestJS exception, rethrow it
          if (
            error instanceof BadRequestException ||
            error instanceof InternalServerErrorException ||
            error instanceof NotFoundException
          ) {
            throw error;
          }

          // Otherwise, throw the original error message as an internal server error
          throw new InternalServerErrorException(
            (error as Error).message || 'Failed to generate image.',
          );
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
            segmentId,
            false,
            `Video generation using kling-v2.1-master model`,
          );

          const video = await klingVideoGen(
            segmentId,
            animation_prompt,
            art_style,
            image_s3_key,
            projectId,
          );

          // Save to database
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: segmentId,
              success: true,
              model: video.model,
              totalVideos: 1,
              projectId: projectId,
              userId: userId,
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
          // Refund credits if they were deducted
          if (creditTransactionId) {
            try {
              await this.creditService.refundCredits(
                userId,
                'VIDEO_GENERATION',
                'kling',
                segmentId,
                creditTransactionId,
                false,
                `Refund for failed video generation: ${error.message}`,
              );
              logger.log(
                `Successfully refunded 20 credits for failed kling generation. User: ${userId}, Operation: ${segmentId}`,
              );
            } catch (refundError) {
              logger.error(
                `Failed to refund credits for user ${userId}, operation ${segmentId}:`,
                refundError,
              );
            }
          }

          // Log the error for debugging purposes
          logger.error(
            `Video generation failed for user ${userId}, operation ${segmentId}: ${(error as Error).message}`,
          );

          // If it's a known NestJS exception, rethrow it
          if (
            error instanceof BadRequestException ||
            error instanceof InternalServerErrorException ||
            error instanceof NotFoundException
          ) {
            throw error;
          }

          // Otherwise, throw the original error message as an internal server error
          throw new InternalServerErrorException(
            (error as Error).message || 'Failed to generate video.',
          );
        }
      } else if (model === 'gen4_turbo') {
        try {
          // Deduct credits before generation
          creditTransactionId = await this.creditService.deductCredits(
            userId,
            'VIDEO_GENERATION',
            'runwayml',
            segmentId,
            false,
            `Video generation using gen4_turbo model`,
          );

          const video = await runwayVideoGen(
            segmentId,
            animation_prompt,
            art_style,
            image_s3_key,
            projectId,
          );

          // Save to database
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: segmentId,
              success: true,
              model: video.model,
              totalVideos: 1,
              projectId: projectId,
              userId: userId,
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
          // Refund credits if they were deducted
          if (creditTransactionId) {
            try {
              await this.creditService.refundCredits(
                userId,
                'VIDEO_GENERATION',
                'runwayml',
                segmentId,
                creditTransactionId,
                false,
                `Refund for failed video generation: ${error.message}`,
              );
              logger.log(
                `Successfully refunded 2.5 credits for failed gen4_turbo generation. User: ${userId}, Operation: ${segmentId}`,
              );
            } catch (refundError) {
              logger.error(
                `Failed to refund credits for user ${userId}, operation ${segmentId}:`,
                refundError,
              );
            }
          }

          // Log the error for debugging purposes
          logger.error(
            `Video generation failed for user ${userId}, operation ${segmentId}: ${(error as Error).message}`,
          );

          // If it's a known NestJS exception, rethrow it
          if (
            error instanceof BadRequestException ||
            error instanceof InternalServerErrorException ||
            error instanceof NotFoundException
          ) {
            throw error;
          }

          // Otherwise, throw the original error message as an internal server error
          throw new InternalServerErrorException(
            (error as Error).message || 'Failed to generate video.',
          );
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
