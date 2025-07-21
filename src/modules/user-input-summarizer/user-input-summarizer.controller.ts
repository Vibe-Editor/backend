import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { UserInputSummarizerDto } from './dto/user-input-summarizer.dto';
import { UpdateUserInputSummarizerDto } from './dto/update-user-input-summarizer.dto';
import { UserInputSummarizerService } from './user-input-summarizer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('user-input-summarizer')
@UseGuards(JwtAuthGuard)
export class UserInputSummarizerController {
  constructor(
    private readonly userInputSummarizerService: UserInputSummarizerService,
  ) {}

  @Post()
  async summarizeContent(
    @Body() userInputSummarizerDto: UserInputSummarizerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.userInputSummarizerService.summarizeContent(
      userInputSummarizerDto,
      userId,
    );
  }

  @Get()
  async getStoredSummaries(
    @CurrentUser('id') userId: string,
    @Query('id') summaryId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (summaryId) {
      return this.userInputSummarizerService.getSummaryById(summaryId, userId);
    }
    return this.userInputSummarizerService.getAllSummaries(userId, projectId);
  }

  @Patch(':id')
  async updateSummary(
    @Param('id') summaryId: string,
    @Body() updateSummaryDto: UpdateUserInputSummarizerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.userInputSummarizerService.updateSummary(
      summaryId,
      updateSummaryDto,
      userId,
    );
  }
}
