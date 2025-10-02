import { Module } from '@nestjs/common';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import { PromptOptimizerService } from './prompt-optimizer.service';
import { CreditService } from '../credits/credit.service';

@Module({
  controllers: [PromptOptimizerController],
  providers: [PromptOptimizerService, CreditService],
  exports: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
