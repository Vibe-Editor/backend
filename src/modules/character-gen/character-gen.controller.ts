import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Query,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { CreateCharacterDto } from './dto/create-character.dto';
import { CharacterGenService } from './character-gen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { VideoGenService } from '../video-gen/video-gen.service';
import { VideoGenDto } from '../video-gen/dto/video-gen.dto';

@Controller('character-gen')
@UseGuards(JwtAuthGuard)
export class CharacterGenController {
  constructor(
    private readonly characterGenService: CharacterGenService,
    private readonly videoGenService: VideoGenService,
  ) {}

  @Post()
  async generateCharacter(
    @Body() createCharacterDto: CreateCharacterDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.characterGenService.generateCharacter(
      createCharacterDto,
      userId,
    );
  }

  @Get()
  async getCharacters(
    @CurrentUser('id') userId: string,
    @Query('id') characterId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (characterId) {
      return this.characterGenService.getCharacterById(characterId, userId);
    }
    return this.characterGenService.getAllCharacters(userId, projectId);
  }

  @Get(':id')
  async getCharacterById(
    @Param('id') characterId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.characterGenService.getCharacterById(characterId, userId);
  }

  @Post(':id/generate-video')
  async generateVideoFromCharacter(
    @Param('id') characterId: string,
    @Body() body: { animation_prompt: string; art_style: string },
    @CurrentUser('id') userId: string,
  ) {
    // Get character details first
    const characterResult = await this.characterGenService.getCharacterById(
      characterId,
      userId,
    );

    if (!characterResult.success || !characterResult.character) {
      throw new BadRequestException('Character not found or access denied');
    }

    const character = characterResult.character;

    // Use the final character image for video generation
    if (!character.finalCharacterS3Key) {
      throw new BadRequestException(
        'Character does not have a final image for video generation',
      );
    }

    // Create video generation DTO
    const videoGenDto: VideoGenDto = {
      animation_prompt: body.animation_prompt,
      art_style: body.art_style,
      imageS3Key: character.finalCharacterS3Key,
      uuid: character.uuid,
    };

    // Generate video using the video service
    return this.videoGenService.generateVideo(videoGenDto, userId);
  }
}
