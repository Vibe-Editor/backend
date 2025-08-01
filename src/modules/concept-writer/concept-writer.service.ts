import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConceptWriterDto } from './dto/concept-writer.dto';
import { GoogleGenAI } from '@google/genai';
import { GeneratedResponse } from './concept-writer.interface';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditService } from '../credits/credit.service';

@Injectable()
export class ConceptWriterService {
  private gemini: GoogleGenAI;
  private readonly logger = new Logger(ConceptWriterService.name);
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set.');
    }
    this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async getConcept(
    conceptWriterDto: ConceptWriterDto,
    userId: string,
  ): Promise<GeneratedResponse> {
    // Use projectId from body - no fallback project creation logic
    const { prompt, web_info, projectId } = conceptWriterDto;
    this.logger.log(`Using project ${projectId} for concept generation`);

    const systemPrompt = `Generate 3-4 creative video concept ideas based on this prompt: "${prompt}"

    Keep in mind the latest information about the topic: ${web_info}

    Return ONLY a valid JSON object in this exact format, with no additional text or formatting:
    {
      "concepts": [
        {
          "title": "The title of the video",
          "concept": "Detailed description of the concept",
          "tone": "The tone/style of the video",
          "goal": "What the video aims to achieve"
        }
      ]
    }

    Make the concepts creative, engaging, and well-thought-out. Here's an example of the style and depth expected:

    {
      "title": "Just Another Crypto Event?",
      "concept": "A parody video that starts like a typical crypto ad — same old voiceover, generic visuals — but it gets interrupted by a voice from the audience saying, 'Ugh, just another crypto event?' We then flip the script and show why Solana Summit is actually different: real builders, beach vibes, crazy energy.",
      "tone": "Self-aware, funny, and hype",
      "goal": "Call out the cliché, win back attention, and make people curious"
    }`;

    let creditTransactionId: string | null = null;

    try {
      // ===== ATOMIC CREDIT DEDUCTION =====
      this.logger.log(`Deducting credits for concept generation`);

      // Deduct credits first - this handles validation internally and prevents race conditions
      creditTransactionId = await this.creditService.deductCredits(
        userId,
        'TEXT_OPERATIONS',
        'concept-gen',
        `concept-gen-${Date.now()}`,
        false,
        `Concept generation using Gemini API`,
      );

      this.logger.log(
        `Successfully deducted credits for concept generation. Transaction ID: ${creditTransactionId}`,
      );
      // ===== END CREDIT DEDUCTION =====
      const result = await this.gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: systemPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              concepts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    concept: { type: 'string' },
                    tone: { type: 'string' },
                    goal: { type: 'string' },
                  },
                  required: ['title', 'concept', 'tone', 'goal'],
                },
              },
            },
            required: ['concepts'],
          },
        },
      });

      let text = result.text.trim();

      // Try to find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in the response');
      }

      text = jsonMatch[0];

      try {
        const parsed = JSON.parse(text) as GeneratedResponse;

        if (
          !parsed.concepts ||
          !Array.isArray(parsed.concepts) ||
          parsed.concepts.length === 0
        ) {
          throw new Error(
            'Invalid response structure: missing or empty concepts array',
          );
        }

        // ===== CONCEPT GENERATION SUCCESS =====
        this.logger.log(
          `Successfully generated ${parsed.concepts.length} concepts`,
        );

        // Save each concept to the database (credits already deducted)
        this.logger.log(
          `Saving ${parsed.concepts.length} concepts to database`,
        );

        const savedConcepts = await Promise.all(
          parsed.concepts.map(async (concept) => {
            const savedConcept = await this.prisma.videoConcept.create({
              data: {
                prompt,
                webInfo: web_info || '',
                title: concept.title,
                concept: concept.concept,
                tone: concept.tone,
                goal: concept.goal,
                projectId,
                userId,
                // Add credit tracking
                creditTransactionId: creditTransactionId,
                creditsUsed: new Decimal(1), // Fixed 1 credit for concept generation
              },
            });
            this.logger.log(
              `Saved concept: ${savedConcept.id} - ${concept.title}`,
            );
            return savedConcept;
          }),
        );

        // Also save to conversation history
        await this.prisma.conversationHistory.create({
          data: {
            type: 'CONCEPT_GENERATION',
            userInput: prompt,
            response: JSON.stringify(parsed),
            metadata: {
              webInfo: web_info,
              conceptCount: parsed.concepts.length,
              savedConceptIds: savedConcepts.map((c) => c.id),
            },
            projectId,
            userId,
          },
        });

        this.logger.log(
          `Successfully saved ${savedConcepts.length} concepts and conversation history`,
        );

        // Get user's new balance after credit deduction
        const newBalance = await this.creditService.getUserBalance(userId);

        return {
          ...parsed,
          credits: {
            used: 1, // Fixed 1 credit for concept generation
            balance: newBalance.toNumber(),
          },
        };
      } catch (parseError) {
        this.logger.error(`JSON parsing error: ${parseError.message}`);
        this.logger.error(`Attempted to parse: ${text}`);
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to generate concepts: ${error.message}`);

      // Refund credits if deduction was successful
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'TEXT_OPERATIONS',
            'concept-gen',
            `concept-gen-${Date.now()}`,
            creditTransactionId,
            false,
            `Refund for failed concept generation: ${error.message}`,
          );
          this.logger.log(
            `Successfully refunded 1 credit for failed concept generation. User: ${userId}`,
          );
        } catch (refundError) {
          this.logger.error(
            `Failed to refund credits for concept generation: ${refundError.message}`,
          );
        }
      }

      throw new Error(`Failed to generate concepts: ${error.message}`);
    }
  }

  /**
   * Get all concepts for a user, optionally filtered by project
   */
  async getAllConcepts(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const concepts = await this.prisma.videoConcept.findMany({
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
        `Retrieved ${concepts.length} concepts for user ${userId}${
          projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: concepts.length,
        concepts,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve concepts: ${error.message}`);
      throw new Error(`Failed to retrieve concepts: ${error.message}`);
    }
  }

  /**
   * Get a specific concept by ID for a user
   */
  async getConceptById(conceptId: string, userId: string) {
    try {
      const concept = await this.prisma.videoConcept.findFirst({
        where: {
          id: conceptId,
          userId, // Ensure user can only access their own concepts
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

      if (!concept) {
        throw new NotFoundException(
          `Concept with ID ${conceptId} not found or you don't have access to it`,
        );
      }

      this.logger.log(`Retrieved concept ${conceptId} for user ${userId}`);

      return {
        success: true,
        concept,
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve concept ${conceptId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve concept: ${error.message}`);
    }
  }

  /**
   * Update the prompt of a specific concept by ID for a user
   */
  async updateConceptPrompt(
    conceptId: string,
    updateData: { prompt: string; projectId?: string },
    userId: string,
  ) {
    try {
      // First check if the concept exists and belongs to the user
      const existingConcept = await this.prisma.videoConcept.findFirst({
        where: {
          id: conceptId,
          userId, // Ensure user can only update their own concepts
        },
      });

      if (!existingConcept) {
        throw new NotFoundException(
          `Concept with ID ${conceptId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {
        prompt: updateData.prompt,
      };
      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      // Update the concept
      const updatedConcept = await this.prisma.videoConcept.update({
        where: {
          id: conceptId,
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

      this.logger.log(`Updated concept ${conceptId} prompt for user ${userId}`);

      // Log the update in conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'CONCEPT_GENERATION',
          userInput: `Updated prompt for concept ${conceptId}`,
          response: JSON.stringify({
            action: 'update_concept',
            conceptId,
            oldPrompt: existingConcept.prompt,
            newPrompt: updateData.prompt,
            updatedFields: updateFields,
          }),
          metadata: {
            action: 'update',
            conceptId,
            oldPrompt: existingConcept.prompt,
            updatedFields: Object.keys(updateFields),
          },
          projectId: updatedConcept.projectId,
          userId,
        },
      });

      return {
        success: true,
        message: 'Concept prompt updated successfully',
        concept: updatedConcept,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update concept ${conceptId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update concept: ${error.message}`);
    }
  }
}
