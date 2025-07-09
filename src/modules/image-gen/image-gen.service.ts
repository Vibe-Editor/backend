import { Injectable } from '@nestjs/common';
import { fal } from '@fal-ai/client';
import { ImageGenDto } from './dto/image-gen.dto';

@Injectable()
export class ImageGenService {
  private readonly fal: typeof fal;

  constructor() {
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_API_KEY environment variable not set.');
    }
    fal.config({
      credentials: process.env.FAL_KEY,
    });
  }
  async generateImage(imageGenDto: ImageGenDto) {
    const result = await fal.subscribe('fal-ai/imagen4/preview', {
      input: {
        prompt: imageGenDto.visual_prompt,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });
    // console.log(result.data);
    return result.data;
  }
}
