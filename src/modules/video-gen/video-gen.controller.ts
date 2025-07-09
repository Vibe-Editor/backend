import { Body, Controller, Post } from '@nestjs/common';
import { VideoGenService } from './video-gen.service';
import { VideoGenDto } from './dto/video-gen.dto';

@Controller('video-gen')
export class VideoGenController {
    constructor(private readonly videoGenService: VideoGenService){}

    @Post()
    generateVideo(@Body() videoGenDto: VideoGenDto) {
        return this.videoGenService.generateVideo(videoGenDto);
    }
}
