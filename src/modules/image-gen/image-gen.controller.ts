import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ImageGenDto } from './dto/image-gen.dto';
import { ImageGenService } from './image-gen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('image-gen')
@UseGuards(JwtAuthGuard)
export class ImageGenController {
  constructor(private readonly imageGenService: ImageGenService) {}

  @Post()
  generateImage(
    @Body() imageGenDto: ImageGenDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.imageGenService.generateImage(imageGenDto, userId);
  }
}
