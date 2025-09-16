import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SummariesService } from './summaries.service';
import { CreateSummaryDto } from './dto/create-summary.dto';
import { UpdateSummaryDto } from './dto/update-summary.dto';
import { GenerateSummaryDto } from './dto/generate-summary.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('summaries')
@UseGuards(JwtAuthGuard)
export class SummariesController {
  constructor(private readonly summariesService: SummariesService) {}

  @Post('generate')
  async generateSummary(
    @Body() generateSummaryDto: GenerateSummaryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.summariesService.generateSummary(generateSummaryDto, userId);
  }

  @Post()
  async createSummary(
    @Body() createSummaryDto: CreateSummaryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.summariesService.createSummary(createSummaryDto, userId);
  }

  @Get()
  async getAllSummaries(
    @CurrentUser('id') userId: string,
    @Query('id') summaryId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (summaryId) {
      return this.summariesService.getSummary(summaryId, userId);
    }
    return this.summariesService.getAllSummaries(userId, projectId);
  }

  @Patch(':id')
  async updateSummary(
    @Param('id') id: string,
    @Body() updateSummaryDto: UpdateSummaryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.summariesService.updateSummary(id, updateSummaryDto, userId);
  }

  @Delete(':id')
  async deleteSummary(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.summariesService.deleteSummary(id, userId);
  }
}
