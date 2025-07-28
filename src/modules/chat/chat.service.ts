import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { recraftImageGen } from './image-generation/recraft.model';
import { ChatDto } from './dto/chat.dto';
import { imagenImageGen } from './image-generation/imagen.model';
import { klingVideoGen } from './video-generation/kling.model';
import { runwayVideoGen } from './video-generation/runway.model';

const logger = new Logger('ChatService');

@Injectable()
export class ChatService {
  async chat(chatDto: ChatDto) {
    const { model, gen_type, uuid, visual_prompt, animation_prompt, image_s3_key, art_style, projectId } =
      chatDto;
    
    if (gen_type === 'image') {
      if (model === 'recraft-v3') {
        try {
          const image = await recraftImageGen(uuid, visual_prompt, art_style);
          return image;
        } catch (error) {
          throw new Error('Failed to generate image');
        }
      } else if (model === 'imagen') {
        try {
          const image = await imagenImageGen(uuid, visual_prompt, art_style);
          return image;
        } catch (error) {
          throw new Error('Failed to generate image');
        }
      }
    } else if (gen_type === 'video') {
      if (!image_s3_key) {
        throw new BadRequestException('imageS3Key is required for video generation');
      }
      
      if (model === 'kling-v2.1-master') {
        try {
          const video = await klingVideoGen(uuid, animation_prompt, art_style, image_s3_key);
          return video;
        } catch (error) {
          throw new Error('Failed to generate video');
        }
      } else if (model === 'gen4_turbo') {
        try {
          const video = await runwayVideoGen(uuid, animation_prompt, art_style, image_s3_key);
          return video;
        } catch (error) {
          throw new Error('Failed to generate video');
        }
      }
    }
  }
}
