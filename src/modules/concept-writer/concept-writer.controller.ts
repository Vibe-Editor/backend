import { Body, Controller, Post } from '@nestjs/common';
import { ConceptWriterDto } from './dto/concept-writer.dto';
import { ConceptWriterService } from './concept-writer.service';
import { GeneratedResponse } from './concept-writer.interface';

@Controller('concept-writer')
export class ConceptWriterController {
    constructor(private readonly conceptWriterService: ConceptWriterService) {}

    @Post()
    getConceptWriter(@Body() conceptWriterDto: ConceptWriterDto): Promise<GeneratedResponse> {
        return this.conceptWriterService.getConcept(conceptWriterDto);
    }
}
