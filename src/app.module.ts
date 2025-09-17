import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SegmentationModule } from './modules/segmentation/segmentation.module';
import { ImageGenModule } from './modules/image-gen/image-gen.module';
import { VideoGenModule } from './modules/video-gen/video-gen.module';
import { HealthModule } from './modules/health/health.module';
import { VoiceoverModule } from './modules/voiceover/voiceover.module';
import { GetWebInfoModule } from './modules/get-web-info/get-web-info.module';
import { ConceptWriterModule } from './modules/concept-writer/concept-writer.module';
import { UserInputSummarizerModule } from './modules/user-input-summarizer/user-input-summarizer.module';
import { CharacterGenModule } from './modules/character-gen/character-gen.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { CreditsModule } from './modules/credits/credits.module';
import { ChatModule } from './modules/chat/chat.module';
import { AgentModule } from './modules/agent/agent.module';
import { TextToVideoModule } from './modules/texttovideo/agent.module';
import { VoiceGenModule } from './modules/voice-gen/voice-gen.module';
import { ContextModule } from './modules/context/context.module';
import { SummariesModule } from './modules/summaries/summaries.module';
import { VideoEditingModule } from './modules/video-editing/video-editing.module';
import { AgentModuleV2 } from './modules/agentv2/agentv2.module';
import { QuestionsModule } from './modules/questions/questions.module';

import { PromptOptimizerModule } from './modules/prompt-optimizer/prompt-optimizer.module';

import { VideoTemplatesModule } from './modules/video-templates/video-templates.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    SegmentationModule,
    ImageGenModule,
    VideoGenModule,
    HealthModule,
    VoiceoverModule,
    GetWebInfoModule,
    ConceptWriterModule,
    UserInputSummarizerModule,
    CharacterGenModule,
    UploadsModule,
    CreditsModule,
    ChatModule,
    AgentModule,
    TextToVideoModule,
    VoiceGenModule,
    ContextModule,
    SummariesModule,
    VideoEditingModule,
    AgentModuleV2
    QuestionsModule,
    PromptOptimizerModule,
    VideoTemplatesModule,

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
