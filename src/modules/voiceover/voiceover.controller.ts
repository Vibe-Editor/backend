import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { VoiceoverService } from './voiceover.service';
import { VoiceoverDto } from './dto/voiceover.dto';
import { UpdateVoiceoverDto } from './dto/update-voiceover.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('voiceover')
@UseGuards(JwtAuthGuard)
export class VoiceoverController {
  constructor(private readonly voiceoverService: VoiceoverService) {}

  @Post()
  generateVoiceover(
    @Body() voiceoverDto: VoiceoverDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.voiceoverService.generateVoiceover(voiceoverDto, userId);
  }

  @Get()
  async getStoredVoiceovers(
    @CurrentUser('id') userId: string,
    @Query('id') voiceoverId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (voiceoverId) {
      return this.voiceoverService.getVoiceoverById(voiceoverId, userId);
    }
    return this.voiceoverService.getAllVoiceovers(userId, projectId);
  }

  @Patch(':id')
  async updateVoiceoverPrompt(
    @Param('id') voiceoverId: string,
    @Body() updateVoiceoverDto: UpdateVoiceoverDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.voiceoverService.updateVoiceoverPrompt(
      voiceoverId,
      updateVoiceoverDto.narration_prompt,
      userId,
      updateVoiceoverDto.s3_key,
    );
  }
}
