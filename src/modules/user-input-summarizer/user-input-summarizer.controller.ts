import { Controller, Post, Body } from '@nestjs/common';
import { UserInputSummarizerDto } from './dto/user-input-summarizer.dto';
import { UserInputSummarizerService } from './user-input-summarizer.service';

@Controller('user-input-summarizer')
export class UserInputSummarizerController {
  constructor(
    private readonly userInputSummarizerService: UserInputSummarizerService,
  ) {}

  @Post()
  async summarizeContent(
    @Body() userInputSummarizerDto: UserInputSummarizerDto,
  ) {
    return this.userInputSummarizerService.summarizeContent(
      userInputSummarizerDto,
    );
  }
}
