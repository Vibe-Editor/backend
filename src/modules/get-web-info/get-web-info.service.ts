import { Injectable } from '@nestjs/common';
import { GetWebInfoDto } from './dto/get-web-info.dto';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';

@Injectable()
export class GetWebInfoService {
  private readonly prisma = new PrismaClient();

  constructor(private readonly projectHelperService: ProjectHelperService) {}

  async getWebInfo(getWebInfoDto: GetWebInfoDto, userId: string) {
    // Ensure user has a project (create default if none exists)
    const projectId =
      await this.projectHelperService.ensureUserHasProject(userId);
    console.log(`Using project ${projectId} for web research`);

    const { prompt } = getWebInfoDto;

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
}
