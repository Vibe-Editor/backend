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
    const result = await fal.subscribe('fal-ai/recraft/v3/text-to-image', {
      input: {
        prompt: `VISUAL PROMPT: ${imageGenDto.visual_prompt}. ART STYLE: ${imageGenDto.art_style}. Follow the art style but make the image according to the visual prompt. The image should not be a storyboard image. It should be a single image.`,
        style: 'realistic_image',
        format: 'png',
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    });

    return result.data;
  }
}
