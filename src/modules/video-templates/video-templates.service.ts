import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { VideoTemplateResponseDto, CreateVideoTemplateDto } from './dto/video-template.dto';

@Injectable()
export class VideoTemplatesService {
  private readonly logger = new Logger(VideoTemplatesService.name);
  private prisma = new PrismaClient();

  constructor() {}

  async findSimilarTemplates(
    description: string,
  ): Promise<VideoTemplateResponseDto[]> {
    try {
      const allTemplates = await this.prisma.videoTemplate.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (allTemplates.length === 0) {
        this.logger.warn('No video templates found in database');
        return [];
      }

      const templatesForGPT = allTemplates.map((template) => ({
        id: template.id,
        description: template.description,
        jsonPrompt: template.jsonPrompt,
      }));

      const gptResponse = await this.getGPTRecommendations(
        description,
        templatesForGPT,
      );

      const topTemplateIds = gptResponse.slice(0, 4);

      const selectedTemplates = allTemplates.filter((template) =>
        topTemplateIds.includes(template.id),
      );

      const orderedTemplates = topTemplateIds
        .map((id) => selectedTemplates.find((template) => template.id === id))
        .filter(Boolean);

      return orderedTemplates.map((template) => ({
        id: template.id,
        description: template.description,
        jsonPrompt: template.jsonPrompt,
        s3Key: template.s3Key,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      }));
    } catch (error) {
      this.logger.error('Error finding similar templates:', error);
      throw error;
    }
  }

  private async getGPTRecommendations(
    userDescription: string,
    templates: Array<{ id: string; description: string; jsonPrompt: string }>,
  ): Promise<string[]> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(userDescription, templates);

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-5-nano',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: any = await response.json();
      const gptContent: any = data.choices[0]?.message?.content;

      if (!gptContent) {
        throw new Error('No response from GPT');
      }

      const templateIds = this.parseGPTResponse(gptContent as string);

      if (templateIds.length === 0) {
        this.logger.warn(
          'GPT returned no valid template IDs, falling back to first 4 templates',
        );
        return templates.slice(0, 4).map((t) => t.id);
      }

      return templateIds;
    } catch (error) {
      this.logger.error('Error getting GPT recommendations:', error);
      return templates.slice(0, 4).map((t) => t.id);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert video template recommendation system. Your task is to analyze a user's video description and recommend the 4 most suitable video templates from the provided database.

ANALYSIS CRITERIA:
1. **Visual Style Match**: Consider composition, camera movement, lighting, and aesthetic
2. **Content Type**: Match talking head vs product showcase vs cinematic ads vs explainer videos
3. **Tone & Mood**: Professional, casual, luxury, tech-focused, lifestyle, etc.
4. **Production Values**: High-end cinematic vs simple talking head vs product demo
5. **Target Audience**: Corporate, consumer, educational, marketing, etc.

RESPONSE FORMAT:
Return ONLY a JSON array of exactly 4 template IDs in order of best match to worst match.
Example: ["template_id_1", "template_id_2", "template_id_3", "template_id_4"]

MATCHING STRATEGY:
- Prioritize templates that match the core video type (talking head, product, cinematic, etc.)
- Consider visual style and production complexity
- Look for similar subject matter, settings, and presentation style
- Balance variety while maintaining relevance
- If unsure between options, prefer higher production value templates

Do not include any explanation or additional text - only return the JSON array.`;
  }

  private buildUserPrompt(
    userDescription: string,
    templates: Array<{ id: string; description: string; jsonPrompt: string }>,
  ): string {
    const templatesText = templates
      .map(
        (template, index) =>
          `${index + 1}. ID: "${template.id}"
Description: "${template.description}"
Technical Details: ${template.jsonPrompt}`,
      )
      .join('\n\n');

    return `USER'S VIDEO DESCRIPTION:
"${userDescription}"

AVAILABLE TEMPLATES:
${templatesText}

Based on the user's description, recommend the 4 best matching templates. Consider visual style, content type, production approach, and overall aesthetic fit.`;
  }

  private parseGPTResponse(gptContent: string): string[] {
    try {
      const cleanContent = gptContent.trim();

      let jsonMatch = cleanContent.match(/\[.*\]/s);
      if (!jsonMatch) {
        jsonMatch = cleanContent.match(/```json\s*(\[.*\])\s*```/s);
        if (jsonMatch) {
          jsonMatch = [jsonMatch[1]];
        }
      }

      if (jsonMatch) {
        const parsed: any = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((id) => typeof id === 'string').slice(0, 4);
        }
      }

      const idMatches = cleanContent.match(/"([^"]+)"/g);
      if (idMatches) {
        return idMatches
          .map((match) => match.replace(/"/g, ''))
          .slice(0, 4);
      }

      return [];
    } catch (error) {
      this.logger.error('Error parsing GPT response:', error);
      return [];
    }
  }

  async getAllTemplates(page: number = 1, limit: number = 10): Promise<{
    data: VideoTemplateResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.prisma.videoTemplate.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.videoTemplate.count(),
    ]);

    return {
      data: templates.map((template) => ({
        id: template.id,
        description: template.description,
        jsonPrompt: template.jsonPrompt,
        s3Key: template.s3Key,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createTemplate(createTemplateDto: CreateVideoTemplateDto): Promise<VideoTemplateResponseDto> {
    try {
      this.logger.log(`Creating new video template: ${createTemplateDto.description.substring(0, 50)}...`);
      
      const template = await this.prisma.videoTemplate.create({
        data: {
          description: createTemplateDto.description,
          jsonPrompt: createTemplateDto.jsonPrompt,
          s3Key: createTemplateDto.s3Key,
        },
      });

      this.logger.log(`Successfully created video template with ID: ${template.id}`);

      return {
        id: template.id,
        description: template.description,
        jsonPrompt: template.jsonPrompt,
        s3Key: template.s3Key,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };
    } catch (error) {
      this.logger.error('Error creating video template:', error);
      throw error;
    }
  }
}
