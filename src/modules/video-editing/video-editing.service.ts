import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { CreditService } from '../credits/credit.service';
import {
  VideoEditingRequestDto,
  VideoEditingResponseDto,
  VideoEditingStatusDto,
} from './dto/video-editing.dto';
import { uploadVideoToS3 } from '../video-gen/s3/s3.service';
import { Decimal } from '@prisma/client/runtime/library';
import axios from 'axios';

@Injectable()
export class VideoEditingService {
  private readonly logger = new Logger(VideoEditingService.name);
  private readonly prisma = new PrismaClient();
  private readonly runwayApiUrl = 'https://api.dev.runwayml.com/v1/video_to_video';
  private readonly runwayApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly creditService: CreditService,
  ) {
    this.runwayApiKey = this.configService.get<string>('RUNWAYML_API_KEY');
    if (!this.runwayApiKey) {
      this.logger.warn('RUNWAYML_API_KEY not configured');
    }
  }

  async editVideo(
    userId: string,
    requestDto: VideoEditingRequestDto,
    projectId: string,
  ): Promise<VideoEditingResponseDto> {
    const operationId = this.generateOperationId();
    let transactionId: string | null = null;

    try {
      const creditCheck = await this.creditService.checkUserCredits(
        userId,
        'VIDEO_EDITING',
        'runway-aleph',
        false,
      );

      if (!creditCheck.hasEnoughCredits) {
        throw new BadRequestException(
          `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance.toNumber()}`,
        );
      }

      transactionId = await this.creditService.deductCredits(
        userId,
        'VIDEO_EDITING',
        'runway-aleph',
        operationId,
        false,
        `Video editing with Runway Aleph: ${requestDto.promptText.substring(0, 50)}...`,
      );

      const runwayResponse = await this.callRunwayApi(requestDto);

      let s3Key: string | null = null;
      let savedVideo = null;

      if (runwayResponse.videoUrl) {
        try {
          this.logger.log('Uploading edited video to S3');
          s3Key = await uploadVideoToS3(
            runwayResponse.videoUrl,
            operationId,
            projectId,
          );
          this.logger.log(`Successfully uploaded edited video to S3: ${s3Key}`);
        } catch (s3Error) {
          this.logger.error('Failed to upload video to S3:', s3Error);
        }
      }

      savedVideo = await this.prisma.generatedVideo.create({
        data: {
          animationPrompt: requestDto.promptText,
          artStyle: 'video-editing',
          imageS3Key: requestDto.videoUri,
          uuid: operationId,
          success: !!runwayResponse.videoUrl,
          model: `runway-aleph-${requestDto.model || 'gen4_aleph'}`,
          totalVideos: runwayResponse.videoUrl ? 1 : 0,
          projectId: projectId,
          userId,
          creditsUsed: new Decimal(creditCheck.requiredCredits),
          creditTransactionId: transactionId,
        },
      });

      if (s3Key) {
        await this.prisma.generatedVideoFile.create({
          data: {
            s3Key,
            generatedVideoId: savedVideo.id,
          },
        });
      }


      await this.prisma.conversationHistory.create({
        data: {
          type: 'VIDEO_GENERATION',
          userInput: requestDto.promptText,
          response: JSON.stringify({
            success: !!runwayResponse.videoUrl,
            videoUrl: runwayResponse.videoUrl,
            s3Key,
            model: `runway-aleph-${requestDto.model || 'gen4_aleph'}`,
            operationType: 'video-editing',
          }),
          metadata: {
            originalVideoUri: requestDto.videoUri,
            model: requestDto.model,
            ratio: requestDto.ratio,
            seed: requestDto.seed,
            references: requestDto.references ? JSON.stringify(requestDto.references) : null,
            runwayTaskId: runwayResponse.id || runwayResponse.taskId,
            savedVideoId: savedVideo.id,
          },
          projectId: projectId,
          userId,
        },
      });

      this.logger.log(
        `Video editing request created for user ${userId} with operation ID ${operationId}`,
      );

      return {
        id: operationId,
        status: runwayResponse.status || 'processing',
        videoUrl: runwayResponse.videoUrl,
        s3Key,
        message: runwayResponse.message || 'Video editing request submitted successfully',
        taskId: runwayResponse.id || runwayResponse.taskId,
        estimatedTime: runwayResponse.estimatedTime,
        creditsUsed: creditCheck.requiredCredits,
        transactionId,
        savedVideoId: savedVideo.id,
      };
    } catch (error) {
      this.logger.error(
        `Error processing video editing request for user ${userId}:`,
        error,
      );

      if (transactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'VIDEO_EDITING',
            'runway-aleph',
            operationId,
            transactionId,
            false,
            `Refund for failed video editing: ${error.message}`,
          );
          this.logger.log(`Refunded credits for failed operation ${operationId}`);
        } catch (refundError) {
          this.logger.error(
            `Failed to refund credits for operation ${operationId}:`,
            refundError,
          );
        }
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.response?.status === 401) {
        throw new HttpException(
          'Invalid Runway API key configuration',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (error.response?.status === 429) {
        throw new HttpException(
          'Runway API rate limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new InternalServerErrorException(
        'Failed to process video editing request',
      );
    }
  }

  async getVideoEditingStatus(
    userId: string,
    operationId: string,
  ): Promise<VideoEditingStatusDto> {
    try {
      const videoRecord = await this.prisma.generatedVideo.findFirst({
        where: {
          uuid: operationId,
          userId,
          model: {
            startsWith: 'runway-aleph',
          },
        },
        include: {
          videoFiles: true,
        },
      });

      if (!videoRecord) {
        throw new BadRequestException('Video editing operation not found');
      }

      const conversationHistory = await this.prisma.conversationHistory.findFirst({
        where: {
          userId,
          metadata: {
            path: ['savedVideoId'],
            equals: videoRecord.id,
          },
        },
      });

      const runwayTaskId = conversationHistory?.metadata?.['runwayTaskId'] as string;

      if (videoRecord.success && videoRecord.videoFiles.length > 0) {
        return {
          taskId: runwayTaskId || operationId,
          status: 'completed',
          videoUrl: videoRecord.videoFiles[0]?.s3Key,
          s3Key: videoRecord.videoFiles[0]?.s3Key,
          progress: 100,
          message: 'Video editing completed successfully',
        };
      }

      if (runwayTaskId) {
        try {
          const statusResponse = await this.checkRunwayTaskStatus(runwayTaskId);

          if (statusResponse.status === 'SUCCEEDED' || statusResponse.status === 'completed') {
            try {
              this.logger.log('Video completed, checking for video URL and uploading to S3');
              
              // Get the video URL from the Runway response
              let videoUrl = statusResponse.videoUrl;
              if (!videoUrl && statusResponse.output && statusResponse.output.length > 0) {
                videoUrl = statusResponse.output[0];
              }
              
              if (videoUrl) {
                const s3Key = await uploadVideoToS3(
                  videoUrl,
                  operationId,
                  videoRecord.projectId || 'video-editing',
                );

                await this.prisma.generatedVideoFile.create({
                  data: {
                    s3Key,
                    generatedVideoId: videoRecord.id,
                  },
                });

                await this.prisma.generatedVideo.update({
                  where: { id: videoRecord.id },
                  data: {
                    success: true,
                    totalVideos: 1,
                  },
                });

                this.logger.log(`Successfully uploaded completed video to S3: ${s3Key}`);

                return {
                  taskId: runwayTaskId,
                  status: 'completed',
                  videoUrl: videoUrl,
                  s3Key,
                  progress: 100,
                  message: 'Video editing completed successfully',
                };
              } else {
                this.logger.error('Video completed but no video URL found in response:', statusResponse);
              }
            } catch (s3Error) {
              this.logger.error('Failed to upload completed video to S3:', s3Error);
            }
          }

          return {
            taskId: runwayTaskId,
            status: statusResponse.status,
            videoUrl: statusResponse.videoUrl,
            progress: statusResponse.progress,
            message: statusResponse.message,
          };
        } catch (statusError) {
          this.logger.error(
            `Error checking Runway task status for ${operationId}:`,
            statusError,
          );
        }
      }

      return {
        taskId: runwayTaskId || operationId,
        status: videoRecord.success ? 'completed' : 'processing',
        videoUrl: videoRecord.videoFiles[0]?.s3Key,
        s3Key: videoRecord.videoFiles[0]?.s3Key,
        message: 'Processing video editing request',
      };
    } catch (error) {
      this.logger.error(
        `Error getting video editing status for ${operationId}:`,
        error,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to get video editing status',
      );
    }
  }

  async getUserVideoEditingHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    try {
      const skip = (page - 1) * limit;

      const [videoEditings, total] = await Promise.all([
        this.prisma.generatedVideo.findMany({
          where: {
            userId,
            model: {
              startsWith: 'runway-aleph',
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            uuid: true,
            animationPrompt: true,
            model: true,
            success: true,
            totalVideos: true,
            creditsUsed: true,
            createdAt: true,
            videoFiles: {
              select: {
                s3Key: true,
              },
            },
          },
        }),
        this.prisma.generatedVideo.count({
          where: {
            userId,
            model: {
              startsWith: 'runway-aleph',
            },
          },
        }),
      ]);

      return {
        videoEditings: videoEditings.map((video) => ({
          id: video.uuid,
          promptText: video.animationPrompt,
          model: video.model,
          status: video.success ? 'completed' : 'processing',
          s3Keys: video.videoFiles.map((file) => file.s3Key),
          creditsUsed: video.creditsUsed?.toNumber() || 0,
          createdAt: video.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting video editing history for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to get video editing history',
      );
    }
  }

  private async callRunwayApi(requestDto: VideoEditingRequestDto): Promise<any> {
    if (!this.runwayApiKey) {
      throw new InternalServerErrorException('Runway API key not configured');
    }

    const headers = {
      'Authorization': `Bearer ${this.runwayApiKey}`,
      'X-Runway-Version': '2024-11-06',
      'Content-Type': 'application/json',
    };

    const payload = {
      videoUri: requestDto.videoUri,
      promptText: requestDto.promptText,
      model: requestDto.model || 'gen4_aleph',
      ratio: requestDto.ratio || '1280:720',
      ...(requestDto.seed !== undefined && { seed: requestDto.seed }),
      ...(requestDto.references && { references: requestDto.references }),
      ...(requestDto.contentModeration && { contentModeration: requestDto.contentModeration }),
      ...(requestDto.publicFigureThreshold && { publicFigureThreshold: requestDto.publicFigureThreshold }),
    };

    try {
      const response = await axios.post(this.runwayApiUrl, payload, { headers });
      return response.data;
    } catch (error) {
      this.logger.error('Runway API call failed:', error.response?.data || error.message);
      throw error;
    }
  }

  private async checkRunwayTaskStatus(taskId: string): Promise<any> {
    if (!this.runwayApiKey) {
      throw new InternalServerErrorException('Runway API key not configured');
    }

    const headers = {
      'Authorization': `Bearer ${this.runwayApiKey}`,
      'X-Runway-Version': '2024-11-06',
    };

    try {
      const response = await axios.get(
        `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
        { headers }
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to check Runway task status for ${taskId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async editVideoAndWaitForCompletion(
    userId: string,
    requestDto: VideoEditingRequestDto,
    projectId: string,
  ): Promise<{ s3Key: string; videoUrl: string; creditsUsed: number }> {
    // Submit the video editing request
    const editResponse = await this.editVideo(userId, requestDto, projectId);
    const operationId = editResponse.id;
    const creditsUsed = editResponse.creditsUsed;
    
    this.logger.log(`Starting to monitor video editing operation: ${operationId}`);
    
    // Poll status until completion (max 15 minutes)
    const maxAttempts = 90; // 15 minutes with 10-second intervals
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const status = await this.getVideoEditingStatus(userId, operationId);
        
        this.logger.log(`Check ${attempts}/${maxAttempts} - Status: ${status.status}`);
        
        if (status.status === 'completed' && status.s3Key) {
          this.logger.log(`Video editing completed successfully: ${status.s3Key}`);
          return {
            s3Key: status.s3Key,
            videoUrl: status.videoUrl || '',
            creditsUsed,
          };
        } else if (status.status === 'failed') {
          throw new InternalServerErrorException('Video editing failed');
        }
        
        // Wait 10 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 10000));
        
      } catch (error) {
        this.logger.error(`Error checking status for operation ${operationId}:`, error);
        throw new InternalServerErrorException('Failed to monitor video editing progress');
      }
    }
    
    // Timeout reached
    throw new InternalServerErrorException('Video editing timeout - operation may still be processing');
  }

  private generateOperationId(): string {
    return `video_edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
