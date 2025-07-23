import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Query,
  Param,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateCharacterDto } from './dto/create-character.dto';
import { CharacterGenService } from './character-gen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('character-gen')
@UseGuards(JwtAuthGuard)
export class CharacterGenController {
  constructor(private readonly characterGenService: CharacterGenService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('reference_images', 6))
  async generateCharacter(
    @Body() createCharacterDto: CreateCharacterDto,
    @UploadedFiles() referenceImages: Express.Multer.File[],
    @CurrentUser('id') userId: string,
  ) {
    return this.characterGenService.generateCharacter(
      createCharacterDto,
      referenceImages,
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
}
