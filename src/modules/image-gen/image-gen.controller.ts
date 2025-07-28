import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { ImageGenDto } from './dto/image-gen.dto';
import { UpdateImageGenDto } from './dto/update-image-gen.dto';
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

  @Get()
  async getStoredImages(
    @CurrentUser('id') userId: string,
    @Query('id') imageId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (imageId) {
      return this.imageGenService.getImageById(imageId, userId);
    }
    return this.imageGenService.getAllImages(userId, projectId);
  }

  @Patch(':id')
  async updateImagePrompt(
    @Param('id') imageId: string,
    @Body() updateImageGenDto: UpdateImageGenDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.imageGenService.updateImagePrompt(
      imageId,
      updateImageGenDto,
      userId,
    );
  }
}
