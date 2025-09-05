import { Module } from '@nestjs/common';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';
import { SummaryModule } from '../../common/services/summary.module';

@Module({
  imports: [SummaryModule],
  controllers: [SummariesController],
  providers: [SummariesService],
})
export class SummariesModule {}
