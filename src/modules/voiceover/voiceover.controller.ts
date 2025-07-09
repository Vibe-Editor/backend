import { Controller, Post, Body } from '@nestjs/common';
import { VoiceoverService } from './voiceover.service';
import { VoiceoverDto } from './dto/voiceover.dto';

@Controller('voiceover')
export class VoiceoverController {
    constructor(private readonly voiceoverService: VoiceoverService){}

    @Post()
    generateVoiceover(@Body() voiceoverDto: VoiceoverDto) {
        return this.voiceoverService.generateVoiceover(voiceoverDto);
    }
}
