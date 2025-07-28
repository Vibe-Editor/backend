import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GetWebInfoDto } from './dto/get-web-info.dto';
import { UpdateWebInfoDto } from './dto/update-web-info.dto';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditService } from '../credits/credit.service';

@Injectable()
export class GetWebInfoService {
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {}

  async getWebInfo(getWebInfoDto: GetWebInfoDto, userId: string) {
    // Use projectId from body - no fallback project creation logic
    const { prompt, projectId } = getWebInfoDto;
    console.log(`Using project ${projectId} for web research`);

    // ===== CREDIT SYSTEM INTEGRATION =====
    console.log(`Checking user credits before web research`);

    // Check credits for perplexity web research
    const creditCheck = await this.creditService.checkUserCredits(
      userId,
      'TEXT_OPERATIONS',
      'perplexity',
      false, // no edit calls for web research currently
    );

    if (!creditCheck.hasEnoughCredits) {
      console.error(
        `Insufficient credits for user ${userId}. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance}`,
      );
      throw new BadRequestException(
        `Insufficient credits. Required: ${creditCheck.requiredCredits}, Available: ${creditCheck.currentBalance}`,
      );
    }

    console.log(
      `Credit validation passed. User ${userId} has ${creditCheck.currentBalance} credits available`,
    );
    // ===== END CREDIT VALIDATION =====

    try {
      const response = await fetch(
        'https://api.perplexity.ai/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{ role: 'user', content: prompt }],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // ===== CREDIT DEDUCTION =====
      console.log(`Deducting credits for successful web research`);

      let creditTransactionId: string;
      let actualCreditsUsed: number;

      try {
        // Perplexity uses fixed pricing for web research
        actualCreditsUsed = 1;

        // Deduct credits for web research
        creditTransactionId = await this.creditService.deductCredits(
          userId,
          'TEXT_OPERATIONS',
          'perplexity',
          `web-research-${Date.now()}`, // operationId
          false, // isEditCall - no edit calls for web research currently
          `Web research using Perplexity API`,
        );

        console.log(
          `Successfully deducted ${actualCreditsUsed} credits for web research. Transaction ID: ${creditTransactionId}`,
        );
      } catch (creditError) {
        console.error(
          `Failed to deduct credits after successful web research:`,
          creditError,
        );
        // Note: We still continue and save the research since API call was successful
        // The credit transaction can be handled manually if needed
        creditTransactionId = null;
        actualCreditsUsed = 0;
      }
      // ===== END CREDIT DEDUCTION =====

      // Save to database
      console.log(`Saving web research to database`);
      const savedWebResearch = await this.prisma.webResearchQuery.create({
        data: {
          prompt,
          response: JSON.stringify(data),
          projectId,
          userId,
          // Add credit tracking
          creditTransactionId: creditTransactionId,
          creditsUsed:
            actualCreditsUsed > 0 ? new Decimal(actualCreditsUsed) : null, // Store the actual credits used
        },
      });

      // Save conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'WEB_RESEARCH',
          userInput: prompt,
          response: JSON.stringify(data),
          metadata: {
            savedWebResearchId: savedWebResearch.id,
          },
          projectId,
          userId,
        },
      });

      console.log(`Successfully saved web research: ${savedWebResearch.id}`);

      return data;
    } catch (error) {
      throw new Error(`Failed to get web info: ${error.message}`);
    }
  }

  /**
   * Get all web info queries for a user, optionally filtered by project
   */
  async getAllWebInfo(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const webInfoQueries = await this.prisma.webResearchQuery.findMany({
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

      console.log(
        `Retrieved ${webInfoQueries.length} web info queries for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: webInfoQueries.length,
        webInfoQueries,
      };
    } catch (error) {
      throw new Error(`Failed to retrieve web info queries: ${error.message}`);
    }
  }

  /**
   * Get a specific web info query by ID for a user
   */
  async getWebInfoById(webInfoId: string, userId: string) {
    try {
      const webInfoQuery = await this.prisma.webResearchQuery.findFirst({
        where: {
          id: webInfoId,
          userId, // Ensure user can only access their own queries
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

      if (!webInfoQuery) {
        throw new NotFoundException(
          `Web info query with ID ${webInfoId} not found or you don't have access to it`,
        );
      }

      console.log(`Retrieved web info query ${webInfoId} for user ${userId}`);

      // Parse the response JSON if it's stored as string
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(webInfoQuery.response);
      } catch {
        parsedResponse = webInfoQuery.response;
      }

      return {
        success: true,
        webInfoQuery: {
          ...webInfoQuery,
          response: parsedResponse,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve web info query: ${error.message}`);
    }
  }

  /**
   * Update the prompt and/or project of a specific web info query by ID for a user
   */
  async updateWebInfoPrompt(
    webInfoId: string,
    updateData: UpdateWebInfoDto,
    userId: string,
  ) {
    try {
      // First check if the web info query exists and belongs to the user
      const existingWebInfo = await this.prisma.webResearchQuery.findFirst({
        where: {
          id: webInfoId,
          userId, // Ensure user can only update their own queries
        },
      });

      if (!existingWebInfo) {
        throw new NotFoundException(
          `Web info query with ID ${webInfoId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {
        prompt: updateData.prompt,
      };

      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      // Update the web info query
      const updatedWebInfo = await this.prisma.webResearchQuery.update({
        where: {
          id: webInfoId,
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

      console.log(
        `Updated web info query ${webInfoId} for user ${userId}: ${Object.keys(updateFields).join(', ')}`,
      );

      // Log the update in conversation history
      if (existingWebInfo.projectId) {
        await this.prisma.conversationHistory.create({
          data: {
            type: 'WEB_RESEARCH',
            userInput: JSON.stringify({
              action: 'update_web_info',
              webInfoId,
              newPrompt: updateData.prompt,
              oldPrompt: existingWebInfo.prompt,
              updatedFields: updateFields,
            }),
            response: JSON.stringify({
              success: true,
              message: 'Web info query updated successfully',
              updatedFields: Object.keys(updateFields),
            }),
            metadata: {
              action: 'update',
              webInfoId,
              updatedFields: Object.keys(updateFields),
            },
            projectId: updatedWebInfo.projectId,
            userId,
          },
        });
      }

      // Parse the response JSON if it's stored as string
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(updatedWebInfo.response);
      } catch {
        parsedResponse = updatedWebInfo.response;
      }

      return {
        success: true,
        message: 'Web info query updated successfully',
        webInfoQuery: {
          ...updatedWebInfo,
          response: parsedResponse,
        },
      };
    } catch (error) {
      console.error(
        `Failed to update web info query ${webInfoId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update web info query: ${error.message}`);
    }
  }
}
