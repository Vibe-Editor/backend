import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { UserInputSummarizerDto } from './dto/user-input-summarizer.dto';
import { z } from 'zod';

@Injectable()
export class UserInputSummarizerService {
  private readonly logger = new Logger(UserInputSummarizerService.name);
  private readonly genAI: GoogleGenAI;

  constructor() {
    try {
      if (!process.env.GEMINI_API_KEY) {
        this.logger.error('GEMINI_API_KEY environment variable not set');
        throw new Error('GEMINI_API_KEY environment variable not set.');
      }

      this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      this.logger.log('UserInputSummarizerService initialized successfully');
    } catch (error) {
      this.logger.error(
        'Failed to initialize UserInputSummarizerService',
        error.stack,
      );
      throw error;
    }
  }

  async summarizeContent(
    userInputSummarizerDto: UserInputSummarizerDto,
  ): Promise<{ summary: string }> {
    const startTime = Date.now();
    this.logger.log(
      'Starting content summarization with user input prioritization',
    );

    try {
      // Validate input
      if (
        !userInputSummarizerDto.original_content ||
        userInputSummarizerDto.original_content.trim().length === 0
      ) {
        this.logger.error('Missing or empty original_content');
        throw new BadRequestException(
          'original_content is required and cannot be empty',
        );
      }

      if (
        !userInputSummarizerDto.user_input ||
        userInputSummarizerDto.user_input.trim().length === 0
      ) {
        this.logger.error('Missing or empty user_input');
        throw new BadRequestException(
          'user_input is required and cannot be empty',
        );
      }

      if (userInputSummarizerDto.original_content.length > 10000) {
        this.logger.error(
          `Original content too long: ${userInputSummarizerDto.original_content.length} characters`,
        );
        throw new BadRequestException(
          'original_content must be less than 10000 characters',
        );
      }

      if (userInputSummarizerDto.user_input.length > 5000) {
        this.logger.error(
          `User input too long: ${userInputSummarizerDto.user_input.length} characters`,
        );
        throw new BadRequestException(
          'user_input must be less than 5000 characters',
        );
      }

      const systemPrompt = `You are an AI content summarizer that combines original content with user input, prioritizing user input when conflicts arise.

**CRITICAL RULES:**
1. User input has the HIGHEST PRIORITY - if user input conflicts with original content, always favor user input
2. If user input provides corrections, updates, or different information, use the user input version
3. Only use original content when it doesn't conflict with user input
4. Create a cohesive summary that integrates both sources intelligently

**INPUT:**
Original Content: ${userInputSummarizerDto.original_content}

User Input: ${userInputSummarizerDto.user_input}

**TASK:**
Create a comprehensive summary that prioritizes user input when conflicts exist and integrates non-conflicting information from both sources. Return only the summary text, nothing else.`;

      this.logger.log('Generating summary with Gemini Flash model');
      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: systemPrompt
      });

      const summary = result.text.trim();
      this.logger.debug(`Generated summary: ${summary.substring(0, 200)}...`);

      if (!summary || summary.length === 0) {
        this.logger.error('AI model returned empty summary');
        throw new InternalServerErrorException(
          'AI model returned empty summary',
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Content summarization completed successfully in ${duration}ms`,
      );

      return { summary: summary };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Content summarization failed after ${duration}ms: ${error.message}`,
      );

      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to summarize content: ${error.message}`,
      );
    }
  }
}
