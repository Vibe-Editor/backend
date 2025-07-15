import { Module } from '@nestjs/common';
import { ConceptWriterController } from './concept-writer.controller';
import { ConceptWriterService } from './concept-writer.service';

@Module({
  controllers: [ConceptWriterController],
  providers: [ConceptWriterService]
})
export class ConceptWriterModule {}
