import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { CreditService } from '../credits/credit.service';
import { createHash } from 'crypto';

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
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

  async getUserContext(id: string) {
    this.logger.log(`getUserContext called with id=${id}`);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, userContext: true },
      });

      if (!user) {
        throw new NotFoundException(`User with id=${id} not found`);
      }

      return {
        id: user.id,
        contextItems: user.userContext, // array of strings
      };
    } catch (error) {
      this.logger.error(`Error in getUserContext for id=${id}`, error);
      throw error;
    }
  }


async updateUserContext(
  projectId: string
): Promise<{ id: string; updated: boolean; context: string[]; message?: string }> {
  const startTime = Date.now();
  this.logger.log(
    `Starting user context update from project ${projectId}`
  );

  try {
    // Validate input
    if (!projectId || projectId.trim().length === 0) {
      throw new BadRequestException('projectId is required and cannot be empty');
    }

    // Get project and its context
    this.logger.log(`Fetching project context for project ${projectId}`);
    const existingProject = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        projectSummaries: true,
        userId: true,
        name: true
      }
    });

    if (!existingProject) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    const projectContext = existingProject.projectSummaries || [];
    const userId = existingProject.userId;

    if (projectContext.length === 0) {
      throw new BadRequestException('Project has no context summaries to analyze');
    }

    // Get existing user context
    this.logger.log(`Fetching existing user context for user ${userId}`);
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { 
        userContext: true,
        lastProjectContextHash: true,
        name: true,
        email: true
      }
    });

    if (!existingUser) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const existingContext = existingUser.userContext || [];

    // Generate hash of current project context to check for changes
    const currentProjectContextHash = this.generateContextHash(projectContext);
    
    // Check if project context has changed since last update
    if (existingUser.lastProjectContextHash === currentProjectContextHash) {
      this.logger.log(`No changes in project context detected for user ${userId}. Returning existing context.`);
      
      const duration = Date.now() - startTime;
      this.logger.log(`User context check completed in ${duration}ms - no update needed`);
      
      return {
        id: userId,
        updated: false,
        context: existingContext,
        message: "No changes in project context since last update"
      };
    }

    this.logger.log(`Project context changes detected. Proceeding with LLM analysis.`);

    // Prepare prompt for LLM
    const systemPrompt = `You are an AI agent that analyzes project-specific insights to extract broader user personality traits, work patterns, and craft-specific behaviors.

**CRITICAL INSTRUCTIONS:**
1. You MUST return ONLY a valid JSON array of strings
2. Maximum 10 user-specific statements
3. Focus on USER BEHAVIOR, PERSONALITY, WORK PATTERNS, and CRAFT APPROACH
4. Extract insights about HOW the user works, WHEN they work, WHAT they prioritize
5. Combine existing user context with new project insights
6. Prioritize the most revealing personality and behavioral patterns
7. NO explanations, NO formatting, ONLY the JSON array

**EXISTING USER CONTEXT:**
${existingContext.length > 0 ? existingContext.map((item, i) => `${i + 1}. ${item}`).join('\n') : 'No existing user context'}

**NEW PROJECT CONTEXT TO ANALYZE:**
${projectContext.map((item, i) => `${i + 1}. ${item}`).join('\n')}

**TASK:**
Analyze the project context to extract 8-10 key insights about this USER'S personality, work habits, technical preferences, and behavioral patterns. Focus on:
- Work schedule preferences (morning person, night owl, etc.)
- Technical stack preferences and why
- Problem-solving approach
- Values and priorities (security, performance, user experience, etc.)
- Communication and collaboration style
- Learning and growth patterns
- Craft-specific behaviors and methodologies

Return ONLY a JSON array of strings like:
["behavioral insight 1", "work pattern 2", "technical preference 3"]`;

    // Generate updated context with Gemini
    this.logger.log('Generating updated user context with Gemini Flash model');
    const result = await this.genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: systemPrompt,
    });

    const rawResponse = result.text.trim();
    this.logger.debug(`Raw LLM response: ${rawResponse}`);

    // Parse and validate JSON response
    let updatedContext: string[];
    try {
      // Clean up response - remove markdown formatting if present
      const cleanResponse = rawResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      updatedContext = JSON.parse(cleanResponse);
      
      if (!Array.isArray(updatedContext)) {
        throw new Error('Response is not an array');
      }

      // Validate each item is a string
      updatedContext = updatedContext.filter(item => 
        typeof item === 'string' && item.trim().length > 0
      ).map(item => item.trim());

      // Limit to max 10 items (user context limit from schema comment)
      if (updatedContext.length > 10) {
        updatedContext = updatedContext.slice(0, 10);
      }

      if (updatedContext.length === 0) {
        throw new Error('No valid context items generated');
      }

    } catch (parseError) {
      this.logger.error(`Failed to parse LLM response: ${parseError.message}`);
      this.logger.error(`Raw response was: ${rawResponse}`);
      throw new InternalServerErrorException(
        'AI model returned invalid response format'
      );
    }

    // Update user context in database with new hash
    this.logger.log(`Updating user context in database with ${updatedContext.length} items and new context hash`);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        userContext: updatedContext,
        lastProjectContextHash: currentProjectContextHash,
        lastCreditUpdate: new Date()
      }
    });

    // Note: Skipping conversation history logging since this is an internal system operation
    // that analyzes existing data rather than a user-initiated conversation

    this.logger.log(`Successfully updated user context for user ${userId}`);

    const duration = Date.now() - startTime;
    this.logger.log(
      `User context update completed successfully in ${duration}ms`
    );

    return {
      id: userId,
      updated: true,
      context: updatedContext
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    this.logger.error(
      `User context update failed after ${duration}ms: ${error.message}`
    );

    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof InternalServerErrorException
    ) {
      throw error;
    }

    throw new InternalServerErrorException(
      `Failed to update user context: ${error.message}`
    );
  }
}



  async updateProjectContext(
    projectId: string,
    newConversations: string[]
  ): Promise<{ id: string; updated: boolean; summary: string[] }> {
    const startTime = Date.now();
    this.logger.log(
      `Starting project context update for project ${projectId} with ${newConversations.length} new conversations`
    );

    try {
      // Validate input
      if (!projectId || projectId.trim().length === 0) {
        throw new BadRequestException('projectId is required and cannot be empty');
      }

      if (!newConversations || newConversations.length === 0) {
        throw new BadRequestException('newConversations array is required and cannot be empty');
      }

      // Validate conversation content
      for (const conversation of newConversations) {
        if (!conversation || conversation.trim().length === 0) {
          throw new BadRequestException('All conversations must be non-empty strings');
        }
        if (conversation.length > 2000) {
          throw new BadRequestException('Each conversation must be less than 2000 characters');
        }
      }

      // Get existing project context
      this.logger.log(`Fetching existing project context for project ${projectId}`);
      const existingProject = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          projectSummaries: true,
          userId: true,
          name: true
        }
      });

      if (!existingProject) {
        throw new NotFoundException(`Project with id ${projectId} not found`);
      }

      const existingContext = existingProject.projectSummaries || [];
      const userId = existingProject.userId;

      // Prepare prompt for LLM
      const systemPrompt = `You are an AI agent that analyzes conversations to extract key user preferences and insights for a specific project.

**CRITICAL INSTRUCTIONS:**
1. You MUST return ONLY a valid JSON array of strings
2. Maximum 7-8 preference statements
3. Each statement should be specific, actionable, and relevant to the project
4. Prioritize the most important user preferences from the conversations
5. Combine with existing context but prioritize new insights
6. NO explanations, NO formatting, ONLY the JSON array

**EXISTING PROJECT CONTEXT:**
${existingContext.length > 0 ? existingContext.map((item, i) => `${i + 1}. ${item}`).join('\n') : 'No existing context'}

**NEW CONVERSATIONS:**
${newConversations.map((conv, i) => `Conversation ${i + 1}: ${conv}`).join('\n\n')}

**TASK:**
Analyze all the conversations and existing context to extract 5-7 key user preferences/insights about this project. Return ONLY a JSON array of strings like:
["preference 1", "preference 2", "preference 3"]`;


      // Generate updated context with Gemini
      this.logger.log('Generating updated project context with Gemini Flash model');
      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: systemPrompt,
      });

      const rawResponse = result.text.trim();
      this.logger.debug(`Raw LLM response: ${rawResponse}`);

      // Parse and validate JSON response
      let updatedContext: string[];
      try {
        // Clean up response - remove markdown formatting if present
        const cleanResponse = rawResponse
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        updatedContext = JSON.parse(cleanResponse);

        if (!Array.isArray(updatedContext)) {
          throw new Error('Response is not an array');
        }

        // Validate each item is a string
        updatedContext = updatedContext.filter(item =>
          typeof item === 'string' && item.trim().length > 0
        ).map(item => item.trim());

        // Limit to max 8 items
        if (updatedContext.length > 8) {
          updatedContext = updatedContext.slice(0, 8);
        }

        if (updatedContext.length === 0) {
          throw new Error('No valid context items generated');
        }

      } catch (parseError) {
        this.logger.error(`Failed to parse LLM response: ${parseError.message}`);
        this.logger.error(`Raw response was: ${rawResponse}`);
        throw new InternalServerErrorException(
          'AI model returned invalid response format'
        );
      }

      // Update project context in database
      this.logger.log(`Updating project context in database with ${updatedContext.length} items`);
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          projectSummaries: updatedContext,
          updatedAt: new Date()
        }
      });

      // Save conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'PROJECT_CONTEXT_UPDATE',
          userInput: `Updated context with ${newConversations.length} conversations`,
          response: JSON.stringify({
            updatedContext,
            previousContextCount: existingContext.length,
            newContextCount: updatedContext.length
          }),
          metadata: {
            projectId,
            conversationsProcessed: newConversations.length,
            previousContextItems: existingContext.length,
            newContextItems: updatedContext.length
          },
          projectId,
          userId,
        },
      });

      this.logger.log(`Successfully updated project context for project ${projectId}`);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Project context update completed successfully in ${duration}ms`
      );

      return {
        id: projectId,
        updated: true,
        summary: updatedContext
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Project context update failed after ${duration}ms: ${error.message}`
      );

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to update project context: ${error.message}`
      );
    }
  }

  async getProjectContext(id: string) {
    this.logger.log(`getProjectSummary called with id=${id}`);
    try {
      const project = await this.prisma.project.findUnique({
        where: { id },
        select: { id: true, projectSummaries: true },
      });

      if (!project) {
        throw new NotFoundException(`Project with id=${id} not found`);
      }

      return {
        id: project.id,
        summaryItems: project.projectSummaries, // array of strings
      };
    } catch (error) {
      this.logger.error(`Error in getProjectSummary for id=${id}`, error);
      throw error;
    }
  }

  // Utility function to generate hash of project context array
  private generateContextHash(projectContext: string[]): string {
    const contextString = projectContext.sort().join('|'); // Sort to ensure consistent hashing
    return createHash('sha256').update(contextString).digest('hex');
  }

}
