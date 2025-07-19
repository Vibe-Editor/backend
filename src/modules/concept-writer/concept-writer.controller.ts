import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConceptWriterDto } from './dto/concept-writer.dto';
import { ConceptWriterService } from './concept-writer.service';
import { GeneratedResponse } from './concept-writer.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('concept-writer')
@UseGuards(JwtAuthGuard)
export class ConceptWriterController {
  constructor(private readonly conceptWriterService: ConceptWriterService) {}

  @Post()
  getConceptWriter(
    @Body() conceptWriterDto: ConceptWriterDto,
    @CurrentUser('id') userId: string,
  ): Promise<GeneratedResponse> {
    return this.conceptWriterService.getConcept(conceptWriterDto, userId);
  }

  @Get()
  async getStoredConcepts(
    @CurrentUser('id') userId: string,
    @Query('id') conceptId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (conceptId) {
      return this.conceptWriterService.getConceptById(conceptId, userId);
    }
    return this.conceptWriterService.getAllConcepts(userId, projectId);
  }
}
