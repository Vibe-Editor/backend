import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '../../../generated/prisma';
import { CreditService } from '../../modules/credits/credit.service';

export interface GenerateSummaryDto {
  content: string;
  contentType: 'concept' | 'segment';
  userId: string;
  projectId?: string;
}

export interface CreateSummaryDto {
  content: string;
  summary: string;
  contentType: 'concept' | 'segment';
  userId: string;
  projectId?: string;
  relatedId?: string; // ID of the concept or segment this summary belongs to
}

export interface UpdateSummaryDto {
  content?: string;
  summary?: string;
  projectId?: string;
}

@Injectable()
export class SummaryService {
  private gemini: GoogleGenAI;
  private readonly logger = new Logger(SummaryService.name);
  private readonly prisma = new PrismaClient();

  constructor(private readonly creditService: CreditService) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set.');
    }
    this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  /**
   * Generate a summary for any content type using Gemini Flash
   */
  async generateSummary(dto: GenerateSummaryDto): Promise<string> {
    const { content, contentType, userId, projectId } = dto;
    
    this.logger.log(`Generating summary for ${contentType} for user ${userId}`);

    let creditTransactionId: string | null = null;

    try {
      // Deduct credits for summary generation
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'TEXT_OPERATIONS',
        'summary-generation',
        `summary-${contentType}-${Date.now()}`,
        false,
        `Summary generation for ${contentType} using Gemini Flash`,
      );

      this.logger.log(
        `Successfully deducted credits for summary generation. Transaction ID: ${creditTransactionId}`,
      );

      // Create appropriate system prompt based on content type
      const systemPrompt = this.createSystemPrompt(content, contentType);

      const result = await this.gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: systemPrompt,
        config: {
          responseMimeType: 'text/plain',
        },
      });

      const summary = result.text.trim();

      if (!summary || summary.length === 0) {
        throw new Error('Generated summary is empty');
      }

      this.logger.log(`Successfully generated summary for ${contentType}`);

      // Save to conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'CONTENT_SUMMARY',
          userInput: `Generate summary for ${contentType}`,
          response: summary,
          metadata: {
            contentType,
            summaryLength: summary.length,
            projectId,
          },
          projectId,
          userId,
        },
      });

      return summary;

    } catch (error) {
      this.logger.error(`Failed to generate summary: ${error.message}`);

      // Refund credits if deduction was successful
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'TEXT_OPERATIONS',
            'summary-generation',
            `summary-${contentType}-${Date.now()}`,
            creditTransactionId,
            false,
            `Refund for failed summary generation: ${error.message}`,
          );
          this.logger.log(
            `Successfully refunded credits for failed summary generation. User: ${userId}`,
          );
        } catch (refundError) {
          this.logger.error(
            `Failed to refund credits for summary generation: ${refundError.message}`,
          );
        }
      }

      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Create a summary record in the database
   */
  async createSummary(dto: CreateSummaryDto) {
    this.logger.log(`Creating summary record for ${dto.contentType}`);

    try {
      const summary = await this.prisma.contentSummary.create({
        data: {
          originalContent: dto.content,
          userInput: `Generated summary for ${dto.contentType}`,
          summary: dto.summary,
          projectId: dto.projectId,
          userId: dto.userId,
        },
      });

      this.logger.log(`Successfully created summary record: ${summary.id}`);
      return summary;
    } catch (error) {
      this.logger.error(`Failed to create summary record: ${error.message}`);
      throw new Error(`Failed to create summary record: ${error.message}`);
    }
  }

  /**
   * Get a summary by ID
   */
  async getSummary(id: string, userId: string) {
    try {
      const summary = await this.prisma.contentSummary.findFirst({
        where: {
          id,
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
        throw new Error(`Summary with ID ${id} not found or you don't have access to it`);
      }

      return summary;
    } catch (error) {
      this.logger.error(`Failed to get summary ${id}: ${error.message}`);
      throw new Error(`Failed to get summary: ${error.message}`);
    }
  }

  /**
   * Get all summaries for a user, optionally filtered by project
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
        `Retrieved ${summaries.length} summaries for user ${userId}${
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
      throw new Error(`Failed to retrieve summaries: ${error.message}`);
    }
  }

  /**
   * Update a summary
   */
  async updateSummary(id: string, dto: UpdateSummaryDto, userId: string) {
    try {
      // First check if the summary exists and belongs to the user
      const existingSummary = await this.prisma.contentSummary.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existingSummary) {
        throw new Error(`Summary with ID ${id} not found or you don't have access to it`);
      }

      const updateData: any = {};
      if (dto.content !== undefined) updateData.originalContent = dto.content;
      if (dto.summary !== undefined) updateData.summary = dto.summary;
      if (dto.projectId !== undefined) updateData.projectId = dto.projectId;

      const updatedSummary = await this.prisma.contentSummary.update({
        where: { id },
        data: updateData,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      this.logger.log(`Updated summary ${id} for user ${userId}`);
      return updatedSummary;
    } catch (error) {
      this.logger.error(`Failed to update summary ${id}: ${error.message}`);
      throw new Error(`Failed to update summary: ${error.message}`);
    }
  }

  /**
   * Delete a summary
   */
  async deleteSummary(id: string, userId: string) {
    try {
      // First check if the summary exists and belongs to the user
      const existingSummary = await this.prisma.contentSummary.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existingSummary) {
        throw new Error(`Summary with ID ${id} not found or you don't have access to it`);
      }

      await this.prisma.contentSummary.delete({
        where: { id },
      });

      this.logger.log(`Deleted summary ${id} for user ${userId}`);
      return { success: true, message: 'Summary deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete summary ${id}: ${error.message}`);
      throw new Error(`Failed to delete summary: ${error.message}`);
    }
  }

  /**
   * Create system prompt based on content type
   */
  private createSystemPrompt(content: string, contentType: 'concept' | 'segment'): string {
    if (contentType === 'concept') {
      return `You are an AI assistant that creates concise, engaging summaries for video concepts.

Create a compelling 2-3 sentence summary that captures the essence of this video concept:

${content}

The summary should:
- Be engaging and attention-grabbing
- Highlight the key value proposition
- Be suitable for marketing or promotional use
- Be concise but informative

Return only the summary text, nothing else.`;
    } else {
      return `You are an AI assistant that creates concise summaries for video segments.

Create a brief 1-2 sentence summary that captures the main visual and narrative elements of this video segment:

${content}

The summary should:
- Describe the key visual elements
- Mention the main narrative points
- Be clear and descriptive
- Be suitable for production planning

Return only the summary text, nothing else.`;
    }
  }
}
