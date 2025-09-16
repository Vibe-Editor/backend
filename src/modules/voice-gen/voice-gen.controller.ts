import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VoiceGenService } from './voice-gen.service';
import { CreateVoiceGenDto } from './dto/create-voice-gen.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('voice-gen')
@UseGuards(JwtAuthGuard)
export class VoiceGenController {
  constructor(private readonly voiceGenService: VoiceGenService) {}

  @Post()
  async generateVoice(
    @Body() createVoiceGenDto: CreateVoiceGenDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.voiceGenService.generateVoice(createVoiceGenDto, userId);
  }

  @Get('history')
  async getVoiceHistory(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.voiceGenService.getVoiceHistory(userId, projectId);
  }

  @Get(':id')
  async getVoiceById(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.voiceGenService.getVoiceById(id, userId);
  }
}
