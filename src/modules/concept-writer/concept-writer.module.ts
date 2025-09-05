import { Module } from '@nestjs/common';
import { ConceptWriterController } from './concept-writer.controller';
import { ConceptWriterService } from './concept-writer.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { SummaryModule } from '../../common/services/summary.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, SummaryModule, CreditsModule],
  controllers: [ConceptWriterController],
  providers: [ConceptWriterService],
})
export class ConceptWriterModule {}
