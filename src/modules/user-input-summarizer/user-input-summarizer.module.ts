import { Module } from '@nestjs/common';
import { UserInputSummarizerController } from './user-input-summarizer.controller';
import { UserInputSummarizerService } from './user-input-summarizer.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, CreditsModule],
  controllers: [UserInputSummarizerController],
  providers: [UserInputSummarizerService],
})
export class UserInputSummarizerModule {}
