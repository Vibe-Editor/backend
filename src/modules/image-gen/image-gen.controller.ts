import { Body, Controller, Post } from '@nestjs/common';
import { ImageGenDto } from './dto/image-gen.dto';
import { ImageGenService } from './image-gen.service';

@Controller('image-gen')
export class ImageGenController {
    constructor(private readonly imageGenService: ImageGenService) {}

    @Post()
    generateImage(@Body() imageGenDto: ImageGenDto) {
        return this.imageGenService.generateImage(imageGenDto);
    }
}
