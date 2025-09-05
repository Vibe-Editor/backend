import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SummaryService } from '../../common/services/summary.service';
import { CreateSummaryDto } from './dto/create-summary.dto';
import { UpdateSummaryDto } from './dto/update-summary.dto';
import { GenerateSummaryDto } from './dto/generate-summary.dto';

@Injectable()
export class SummariesService {
  private readonly logger = new Logger(SummariesService.name);

  constructor(private readonly summaryService: SummaryService) {}

  /**
   * Generate a summary using AI
   */
  async generateSummary(dto: GenerateSummaryDto, userId: string) {
    this.logger.log(`Generating summary for ${dto.contentType} for user ${userId}`);

    try {
      const summary = await this.summaryService.generateSummary({
        content: dto.content,
        contentType: dto.contentType,
        userId,
        projectId: dto.projectId,
      });

      return {
        success: true,
        summary,
        contentType: dto.contentType,
      };
    } catch (error) {
      this.logger.error(`Failed to generate summary: ${error.message}`);
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Create a summary record
   */
  async createSummary(dto: CreateSummaryDto) {
    this.logger.log(`Creating summary record for ${dto.contentType}`);

    try {
      const summary = await this.summaryService.createSummary(dto);
      return {
        success: true,
        summary,
      };
    } catch (error) {
      this.logger.error(`Failed to create summary: ${error.message}`);
      throw new Error(`Failed to create summary: ${error.message}`);
    }
  }

  /**
   * Get a summary by ID
   */
  async getSummary(id: string, userId: string) {
    this.logger.log(`Getting summary ${id} for user ${userId}`);

    try {
      const summary = await this.summaryService.getSummary(id, userId);
      return {
        success: true,
        summary,
      };
    } catch (error) {
      this.logger.error(`Failed to get summary ${id}: ${error.message}`);
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw new Error(`Failed to get summary: ${error.message}`);
    }
  }

  /**
   * Get all summaries for a user
   */
  async getAllSummaries(userId: string, projectId?: string) {
    this.logger.log(`Getting all summaries for user ${userId}${projectId ? ` in project ${projectId}` : ''}`);

    try {
      const result = await this.summaryService.getAllSummaries(userId, projectId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to get summaries: ${error.message}`);
      throw new Error(`Failed to get summaries: ${error.message}`);
    }
  }

  /**
   * Update a summary
   */
  async updateSummary(id: string, dto: UpdateSummaryDto, userId: string) {
    this.logger.log(`Updating summary ${id} for user ${userId}`);

    try {
      const summary = await this.summaryService.updateSummary(id, dto, userId);
      return {
        success: true,
        summary,
      };
    } catch (error) {
      this.logger.error(`Failed to update summary ${id}: ${error.message}`);
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw new Error(`Failed to update summary: ${error.message}`);
    }
  }

  /**
   * Delete a summary
   */
  async deleteSummary(id: string, userId: string) {
    this.logger.log(`Deleting summary ${id} for user ${userId}`);

    try {
      const result = await this.summaryService.deleteSummary(id, userId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete summary ${id}: ${error.message}`);
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw new Error(`Failed to delete summary: ${error.message}`);
    }
  }
}
