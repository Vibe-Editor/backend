import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { UserInputSummarizerDto } from './dto/user-input-summarizer.dto';
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
}
