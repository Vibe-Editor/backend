import { Module } from '@nestjs/common';
import { UserInputSummarizerController } from './user-input-summarizer.controller';
import { UserInputSummarizerService } from './user-input-summarizer.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [UserInputSummarizerController],
  providers: [UserInputSummarizerService],
})
export class UserInputSummarizerModule {}
