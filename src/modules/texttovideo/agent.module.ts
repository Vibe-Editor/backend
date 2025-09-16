import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { TextToVideoController } from './texttovideo.controller';
import { TextToVideoService } from './texttovideo.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [AgentController, TextToVideoController],
  providers: [AgentService, TextToVideoService],
  exports: [TextToVideoService],
})
export class TextToVideoModule {}
