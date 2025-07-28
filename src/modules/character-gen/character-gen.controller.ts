import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { CreateCharacterDto } from './dto/create-character.dto';
import { CharacterGenService } from './character-gen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('character-gen')
@UseGuards(JwtAuthGuard)
export class CharacterGenController {
  constructor(private readonly characterGenService: CharacterGenService) {}

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
}
