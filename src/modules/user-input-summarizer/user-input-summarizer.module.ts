import { Module } from '@nestjs/common';
import { UserInputSummarizerController } from './user-input-summarizer.controller';
import { UserInputSummarizerService } from './user-input-summarizer.service';

@Module({
  controllers: [UserInputSummarizerController],
  providers: [UserInputSummarizerService]
})
export class UserInputSummarizerModule {}
