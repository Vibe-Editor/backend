import { Injectable } from '@nestjs/common';
import { fal } from '@fal-ai/client';
import { VideoGenDto } from './dto/video-gen.dto';

@Injectable()
export class VideoGenService {
  private readonly fal: typeof fal;

  constructor() {
    if (!process.env.FAL_KEY) {
      throw new Error('FAL_API_KEY environment variable not set.');
    }
    fal.config({
      credentials: process.env.FAL_KEY,
    });
  }

  async generateVideo(videoGenDto: VideoGenDto) {
    const result = await fal.subscribe(
      'fal-ai/kling-video/v2.1/master/image-to-video',
      {
        input: {
          prompt: `ANIMATION PROMPT: ${videoGenDto.animation_prompt} \n Art style: ${videoGenDto.art_style}`,
          image_url: videoGenDto.image_url,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        },
      },
    );
    return result.data;
    // console.log(result.data);
  }
}
