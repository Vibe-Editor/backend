import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { VoiceoverService } from './voiceover.service';
import { VoiceoverDto } from './dto/voiceover.dto';
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
}
