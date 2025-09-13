import { Module } from '@nestjs/common';
import { AgentControllerV2 } from './agentv2.controller';
import { AgentServiceV2 } from './agentv2.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [AgentControllerV2],
  providers: [AgentServiceV2],
})
export class AgentModuleV2 {}
