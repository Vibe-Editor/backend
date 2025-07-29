import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { recraftImageGen } from './image-generation/recraft.model';
import { ChatDto } from './dto/chat.dto';
import { imagenImageGen } from './image-generation/imagen.model';
import { klingVideoGen } from './video-generation/kling.model';
import { runwayVideoGen } from './video-generation/runway.model';

const logger = new Logger('ChatService');

@Injectable()
export class ChatService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  async chat(chatDto: ChatDto) {
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

    if (gen_type === 'image') {
      if (model === 'recraft-v3') {
        try {
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
              userId: uuid, // Using uuid as userId for now since there's no auth
            },
          });

          return image;
        } catch (error) {
          // Save failed attempt to database
          await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: uuid,
              success: false,
              model: model,
              message: error.message,
              projectId: projectId,
              userId: uuid,
            },
          });
          throw new Error('Failed to generate image');
        }
      } else if (model === 'imagen') {
        try {
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
            },
          });

          return image;
        } catch (error) {
          // Save failed attempt to database
          await this.prisma.generatedImage.create({
            data: {
              visualPrompt: visual_prompt,
              artStyle: art_style,
              uuid: uuid,
              success: false,
              model: model,
              message: error.message,
              projectId: projectId,
              userId: uuid,
            },
          });
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
            },
          });

          // Save video file
          await this.prisma.generatedVideoFile.create({
            data: {
              s3Key: video.s3_key,
              generatedVideoId: savedVideo.id,
            },
          });

          return video;
        } catch (error) {
          // Save failed attempt to database
          await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: uuid,
              success: false,
              model: model,
              projectId: projectId,
              userId: uuid,
            },
          });
          throw new Error('Failed to generate video');
        }
      } else if (model === 'gen4_turbo') {
        try {
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
            },
          });

          // Save video file
          await this.prisma.generatedVideoFile.create({
            data: {
              s3Key: video.s3_key,
              generatedVideoId: savedVideo.id,
            },
          });

          return video;
        } catch (error) {
          // Save failed attempt to database
          await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animation_prompt,
              artStyle: art_style,
              imageS3Key: image_s3_key,
              uuid: uuid,
              success: false,
              model: model,
              projectId: projectId,
              userId: uuid,
            },
          });
          throw new Error('Failed to generate video');
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
