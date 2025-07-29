import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { UserInputSummarizerDto } from './dto/user-input-summarizer.dto';
import { z } from 'zod';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditService } from '../credits/credit.service';

@Injectable()
export class UserInputSummarizerService {
  private readonly logger = new Logger(UserInputSummarizerService.name);
  private readonly genAI: GoogleGenAI;
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {
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
    userId: string,
  ): Promise<{ summary: string; credits: { used: number; balance: number } }> {
    // Use projectId from body - no fallback project creation logic
    const { original_content, user_input, projectId } = userInputSummarizerDto;
    this.logger.log(`Using project ${projectId} for content summarization`);

    const startTime = Date.now();
    this.logger.log(
      'Starting content summarization with user input prioritization',
    );

    let creditTransactionId: string | null = null;

    try {
      // Validate input
      if (!original_content || original_content.trim().length === 0) {
        this.logger.error('Missing or empty original_content');
        throw new BadRequestException(
          'original_content is required and cannot be empty',
        );
      }

      if (!user_input || user_input.trim().length === 0) {
        this.logger.error('Missing or empty user_input');
        throw new BadRequestException(
          'user_input is required and cannot be empty',
        );
      }

      if (original_content.length > 10000) {
        this.logger.error(
          `Original content too long: ${original_content.length} characters`,
        );
        throw new BadRequestException(
          'original_content must be less than 10000 characters',
        );
      }

      if (user_input.length > 5000) {
        this.logger.error(
          `User input too long: ${user_input.length} characters`,
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
Original Content: ${original_content}

User Input: ${user_input}

**TASK:**
Create a comprehensive summary that prioritizes user input when conflicts exist and integrates non-conflicting information from both sources. Return only the summary text, nothing else.`;

      // ===== CREDIT DEDUCTION =====
      this.logger.log(`Deducting credits for content summarization`);

      // Deduct credits first - this handles validation internally
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'TEXT_OPERATIONS',
        'content-summarizer',
        `content-summary-${Date.now()}`, // operationId
        false, // isEditCall - no edit calls for content summarization currently
        `Content summarization using Gemini API`,
      );

      this.logger.log(
        `Successfully deducted credits for content summarization. Transaction ID: ${creditTransactionId}`,
      );
      // ===== END CREDIT DEDUCTION =====

      this.logger.log('Generating summary with Gemini Flash model');
      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: systemPrompt,
      });

      const summary = result.text.trim();
      this.logger.debug(`Generated summary: ${summary.substring(0, 200)}...`);

      if (!summary || summary.length === 0) {
        this.logger.error('AI model returned empty summary');
        throw new InternalServerErrorException(
          'AI model returned empty summary',
        );
      }

      // Save to database
      this.logger.log(`Saving content summary to database`);
      const savedSummary = await this.prisma.contentSummary.create({
        data: {
          originalContent: original_content,
          userInput: user_input || '',
          summary: summary,
          projectId,
          userId,
          // Add credit tracking
          creditTransactionId: creditTransactionId,
          creditsUsed: new Decimal(1), // Content summarization uses fixed pricing
        },
      });

      // Save conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'CONTENT_SUMMARY',
          userInput: user_input || original_content.substring(0, 100) + '...',
          response: JSON.stringify({ summary: summary }),
          metadata: {
            originalContentLength: original_content.length,
            summaryLength: summary.length,
            savedSummaryId: savedSummary.id,
          },
          projectId,
          userId,
        },
      });

      this.logger.log(`Successfully saved content summary: ${savedSummary.id}`);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Content summarization completed successfully in ${duration}ms`,
      );

      // Get user's new balance after credit deduction
      const newBalance = await this.creditService.getUserBalance(userId);

      return {
        summary: summary,
        credits: {
          used: 1, // Content summarization uses fixed pricing
          balance: newBalance.toNumber(),
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Content summarization failed after ${duration}ms: ${error.message}`,
      );

      // Refund credits if they were deducted
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'TEXT_OPERATIONS',
            'content-summarizer',
            `content-summary-${Date.now()}`,
            creditTransactionId,
            false,
            `Refund for failed content summarization: ${error.message}`,
          );
          this.logger.log(
            `Successfully refunded 1 credit for failed content summarization. User: ${userId}`,
          );
        } catch (refundError) {
          this.logger.error(
            `Failed to refund credits for content summarization: ${refundError.message}`,
          );
        }
      }

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

  /**
   * Get all content summaries for a user, optionally filtered by project
   */
  async getAllSummaries(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const summaries = await this.prisma.contentSummary.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      this.logger.log(
        `Retrieved ${summaries.length} content summaries for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: summaries.length,
        summaries,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve summaries: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to retrieve summaries: ${error.message}`,
      );
    }
  }

  /**
   * Get a specific content summary by ID for a user
   */
  async getSummaryById(summaryId: string, userId: string) {
    try {
      const summary = await this.prisma.contentSummary.findFirst({
        where: {
          id: summaryId,
          userId, // Ensure user can only access their own summaries
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!summary) {
        throw new NotFoundException(
          `Content summary with ID ${summaryId} not found or you don't have access to it`,
        );
      }

      this.logger.log(
        `Retrieved content summary ${summaryId} for user ${userId}`,
      );

      return {
        success: true,
        summary,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve summary ${summaryId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to retrieve summary: ${error.message}`,
      );
    }
  }

  /**
   * Update a specific content summary by ID for a user
   */
  async updateSummary(summaryId: string, updateData: any, userId: string) {
    try {
      // First check if the summary exists and belongs to the user
      const existingSummary = await this.prisma.contentSummary.findFirst({
        where: {
          id: summaryId,
          userId, // Ensure user can only update their own summaries
        },
      });

      if (!existingSummary) {
        throw new NotFoundException(
          `Content summary with ID ${summaryId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {};
      if (updateData.original_content !== undefined) {
        updateFields.originalContent = updateData.original_content;
      }
      if (updateData.user_input !== undefined) {
        updateFields.userInput = updateData.user_input;
      }
      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      // Update the content summary
      const updatedSummary = await this.prisma.contentSummary.update({
        where: {
          id: summaryId,
        },
        data: updateFields,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      this.logger.log(
        `Updated content summary ${summaryId} for user ${userId}`,
      );

      // Log the update in conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'CONTENT_SUMMARY',
          userInput: `Updated content summary ${summaryId}`,
          response: JSON.stringify({
            action: 'update_summary',
            summaryId,
            updatedFields: updateFields,
            oldValues: {
              originalContent: existingSummary.originalContent,
              userInput: existingSummary.userInput,
            },
          }),
          metadata: {
            action: 'update',
            summaryId,
            updatedFields: Object.keys(updateFields),
          },
          projectId: updatedSummary.projectId,
          userId,
        },
      });

      return {
        success: true,
        message: 'Content summary updated successfully',
        summary: updatedSummary,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update content summary ${summaryId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to update content summary: ${error.message}`,
      );
    }
  }
}
