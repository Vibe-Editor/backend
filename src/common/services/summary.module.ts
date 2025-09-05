import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service';
import { CreditService } from '../../modules/credits/credit.service';

@Module({
  providers: [SummaryService, CreditService],
  exports: [SummaryService],
})
export class SummaryModule {}
