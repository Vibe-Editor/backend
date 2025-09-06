import { Module } from '@nestjs/common';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';
import { CreditService } from '../credits/credit.service';

@Module({
  controllers: [SummariesController],
  providers: [SummariesService, CreditService],
  exports: [SummariesService],
})
export class SummariesModule {}
