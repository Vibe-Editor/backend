import { Injectable, NotFoundException } from '@nestjs/common';
import { GetWebInfoDto } from './dto/get-web-info.dto';
import { UpdateWebInfoDto } from './dto/update-web-info.dto';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';

@Injectable()
export class GetWebInfoService {
  private readonly prisma = new PrismaClient();

  constructor(private readonly projectHelperService: ProjectHelperService) {}

  async getWebInfo(getWebInfoDto: GetWebInfoDto, userId: string) {
    // Use projectId from body - no fallback project creation logic
    const { prompt, projectId } = getWebInfoDto;
    console.log(`Using project ${projectId} for web research`);

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

      // Save to database
      console.log(`Saving web research to database`);
      const savedWebResearch = await this.prisma.webResearchQuery.create({
        data: {
          prompt,
          response: JSON.stringify(data),
          projectId,
          userId,
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
