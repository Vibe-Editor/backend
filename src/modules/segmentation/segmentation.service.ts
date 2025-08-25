import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { SegmentationDto } from './dto/segmentation.dto';
import { TypeSegment } from './segment.interface';
import OpenAI from 'openai';
import { ProjectHelperService } from '../../common/services/project-helper.service';
import { PrismaClient } from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditService } from '../credits/credit.service';

@Injectable()
export class SegmentationService {
  private readonly genAI: GoogleGenAI;
  private readonly openai: OpenAI;
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly projectHelperService: ProjectHelperService,
    private readonly creditService: CreditService,
  ) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set.');
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not set.');
    }
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private async generateScriptWithGemini(options: {
    narrationPrompt: string;
    visualPrompt: string;
    animationPrompt: string;
    concept: string;
    negativePrompt: string;
    model: string;
  }): Promise<{
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
    model: string;
  }> {
    const { narrationPrompt, visualPrompt, animationPrompt, model } = options;

    const [animationRes, narrationRes, artStyleRes] =
      await Promise.all([
        this.genAI.models.generateContent({
          model,
          contents: animationPrompt,
        }),
        this.genAI.models.generateContent({
          model,
          contents: narrationPrompt,
        }),
        this.genAI.models.generateContent({
          model,
          contents: `VISUAL PROMPT: ${visualPrompt} \n ANIMATION PROMPT: ${animationPrompt}. \n Your task is to generate a art style prompt using the visual prompt and animation prompt. This is to maintain consistency in the visual and animation style. If there's a person involved in the visual, make sure to mention the looks of the person in the art style prompt.
        
        Example Style Prompt for a face wash ad that is minimal:
        showcase the natural and alovera related positives of the face wash product using minimalistic branding and light colors. The face wash has a white colour pack and consists of a skin enhancing lotion made o alovera and natural ingrideints. Use water and fluid elements to portray freshness.

        Keep this style prompt as short as possible. Must be within 300 characters.
        `,
        }),
      ]);

    const animation = animationRes.text?.trim();
    const narration = narrationRes.text?.trim();
    const artStyle = artStyleRes.text?.trim();

    if (!animation || !narration) {
      throw new HttpException(
        'Failed to generate animation and narration with Gemini.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Generate visual script using Director Brain 'Micro' Spec model
    const visual = await this.generateVisualScriptWithDirectorBrain({
      animationPrompt: animation,
      userPrompt: visualPrompt,
      artStyle: artStyle,
      concept: options.concept || '',
      negativePrompt: options.negativePrompt || '',
      model,
    });

    return { narration, visual, animation, artStyle, model: options.model };
  }

  private async generateVisualScriptWithDirectorBrain(options: {
    animationPrompt: string;
    userPrompt: string;
    artStyle: string;
    concept: string;
    negativePrompt: string;
    model: string;
  }): Promise<string> {
    const { animationPrompt, userPrompt, artStyle, concept, negativePrompt, model } = options;

    try {
      const response = await this.genAI.models.generateContent({
        model,
        contents: `You are the **Director Brain 'Micro' Spec** model. Your task is to generate a detailed visual prompt string that incorporates cinematographic principles and contextual storytelling.

### Core Operating Principles
1. Pick the emotion first (E). Everything else follows.
2. Choose perspective (P) & distance (V) to set the connection level.
3. Use angle/space (D) to show power.
4. Stage (S) controls pacing: INTRO should be wide, PIVOT should be tight.
5. Reveal (R) from ENV to DETAIL to escalate meaning over successive shots.

### EPVSDRM Framework Parameters
- **E - Emotion goal:** AWE | TENSION | INTIMACY | QUIET | POWER | LOSS | UNEASE
- **P - Perspective:** EXT | POV | OTS | TWO | GROUP | OH | DUTCH
- **V - View distance:** ELS | LS | MS | MCU | CU | ECU
- **S - Stage in scene:** INTRO | BUILD | PIVOT | BREATHE | BUTTON
- **D - Dynamic / power:** HI_ANGLE | LO_ANGLE | LEVEL | WIDE_SPACE | TIGHT_SPACE
- **R - Reveal level:** ENV | CHAR | DETAIL
- **M - Motion:** STATIC | PUSH_IN | PULL_OUT | TRACK | HANDHELD | CRANE | DRONE

### Input Context
Animation Prompt: ${animationPrompt}
User Prompt: ${userPrompt}
Concept: ${concept}
Art Style: ${artStyle}
Negative Prompt: ${negativePrompt}

### Required Output Format
Generate a detailed visual prompt string that includes:
1. Cinematographic description using EPVSDRM framework
2. Context about how this image fits into the video sequence
3. Detailed visual elements and composition
4. Art style integration
5. Emotional and narrative context

### Example Output Format:
"shot: medium close-up of a man seated in an office cubicle, angled slightly toward camera, soft daylight from window highlights one side of his face, neutral expression, cluttered desk in soft blur behind him, photorealistic human, 35mm film, shallow depth of field, cinematic realism, realistic grain, muted corporate tones --ar 16:9 --v 7 --style raw --chaos 12"

### Instructions:
- Analyze the animation prompt to understand the visual sequence and timing
- Apply EPVSDRM framework to create cinematographic description
- Include context about what moment in the video this image represents
- Add detailed visual elements, lighting, composition, and background
- Integrate the provided art style naturally into the description
- Include emotional and narrative context that supports the overall concept
- Ensure the description aligns with the concept and avoids negative prompt elements
- Return ONLY the visual prompt string, no additional text or formatting

Generate the visual prompt:`,
      });

      const visualScript = response.text?.trim();
      if (!visualScript) {
        throw new HttpException(
          'Failed to generate visual script with Director Brain model.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return visualScript;
    } catch (error) {
      console.error('Error generating visual script with Director Brain:', error);
      throw new HttpException(
        'Failed to generate visual script with Director Brain model.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async generateScriptWithOpenAI(options: {
    narrationPrompt: string;
    visualPrompt: string;
    animationPrompt: string;
    concept: string;
    negativePrompt: string;
  }): Promise<{
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
  }> {
    const { narrationPrompt, visualPrompt, animationPrompt, concept, negativePrompt } = options;

    const [animationRes, narrationRes, artStyleRes] =
      await Promise.all([
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: animationPrompt }],
        }),
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: narrationPrompt }],
        }),
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: `VISUAL PROMPT: ${visualPrompt} \n ANIMATION PROMPT: ${animationPrompt}. \n Your task is to generate a art style prompt using the visual prompt and animation prompt. This is to maintain consistency in the visual and animation style. If there's a person involved in the visual, make sure to mention the looks of the person in the art style prompt.
        
        Example Style Prompt for a face wash ad that is minimal:
        showcase the natural and alovera related positives of the face wash product using minimalistic branding and light colors. The face wash has a white colour pack and consists of a skin enhancing lotion made o alovera and natural ingrideints. Use water and fluid elements to portray freshness.

        Keep this style prompt as short as possible. Must be within 300 characters.
        `,
            },
          ],
        }),
      ]);

    const animation = animationRes.choices[0]?.message?.content?.trim();
    const narration = narrationRes.choices[0]?.message?.content?.trim();
    const artStyle = artStyleRes.choices[0]?.message?.content?.trim();

    if (!animation || !narration) {
      throw new HttpException(
        'Failed to generate animation and narration with OpenAI.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Generate visual script using Director Brain 'Micro' Spec model
    const visual = await this.generateVisualScriptWithDirectorBrain({
      animationPrompt: animation,
      userPrompt: visualPrompt,
      artStyle: artStyle,
      concept: concept,
      negativePrompt: negativePrompt,
      model: 'gemini-2.5-pro-preview-06-05',
    });

    return { narration, visual, animation, artStyle };
  }

  private async segmentGeneratedScript(script: {
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
    negative_prompt: string;
    model: string;
  }): Promise<{ segments: TypeSegment[]; artStyle: string }> {
    const makeSegmentationPrompt = (
      scriptText: string,
      type: 'narration' | 'visual' | 'animation',
      negativePrompt: string,
    ) => {
      const base = `
      Segment the following ${type} script into exactly 5 distinct parts.
      
      Each segment must be returned as a JSON object with:
      - "id": a unique string identifier (e.g., "seg-1", "seg-2", etc.)
      - "segment": the text for that part
      
      Requirements:
      - You must return exactly 5 segments in an array
      - The segment order must preserve the original flow
      - Do NOT include summaries, markdown, or metadata
      - Each segment should be a standalone piece with meaningful flow
      - Do not include any negative prompts in the segment - Negative Prompt is ${negativePrompt}
      `;

      const narrationAddendum = `
      IMPORTANT (for narration scripts):
      Each segment must contain only what the narrator will say aloud. 
      Do NOT describe visuals, camera shots, or sound design. 
      Do NOT include instructions, scene setting, or internal monologue. 
      Only generate spoken lines that match the tone of the style (e.g. professional for ads, intense for hype).
      `;

      const visualAddendum = `
      IMPORTANT (for visual scripts):
      Each segment MUST describe exactly ONE image — not a storyboard, not a sequence.
      The image should be a single, coherent visual concept that can be generated in isolation.
      Do NOT include multiple actions or frames within a segment.
      Focus on visual composition, mood, setting, and core subject for each image.
      PRESERVE ALL TECHNICAL PARAMETERS (--ar, --v, --style, --s, etc.) in each segment.
      Do NOT remove or modify any technical flags or parameters.
      `;

      const animationAddendum = `
      IMPORTANT (for animation scripts):
      Each segment should describe motion and transitions for one continuous shot.
      Avoid visual summaries or multiple scene ideas per segment.
      Only describe how the camera moves, how things animate, and what's happening dynamically on screen.
      `;

      let prompt = base;
      if (type === 'narration') prompt += narrationAddendum;
      if (type === 'visual') prompt += visualAddendum;
      if (type === 'animation') prompt += animationAddendum;

      return `${prompt}
      
      Script:
      ---
      ${scriptText}
      ---
      `;
    };

    const [animationSegRes, narrationSegRes, visualSegRes] = await Promise.all([
      await this.genAI.models.generateContent({
        model: script.model || 'gemini-2.5-flash',
        contents: makeSegmentationPrompt(
          script.narration,
          'narration',
          script.negative_prompt,
        ),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                segment: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
        },
      }),

      await this.genAI.models.generateContent({
        model: script.model || 'gemini-2.5-flash',
        contents: makeSegmentationPrompt(
          script.visual,
          'visual',
          script.negative_prompt,
        ),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                segment: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
        },
      }),

      await this.genAI.models.generateContent({
        model: script.model || 'gemini-2.5-flash',
        contents: makeSegmentationPrompt(
          script.animation,
          'animation',
          script.negative_prompt,
        ),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                segment: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
        },
      }),
    ]);

    const segments: TypeSegment[] = [];

    try {
      const narrationSegments = JSON.parse(narrationSegRes.text);
      const visualSegments = JSON.parse(visualSegRes.text);
      const animationSegments = JSON.parse(animationSegRes.text);
      for (let i = 0; i <= 4; i++) {
        segments.push({
          id: `seg-${i + 1}`,
          narration: animationSegments[i].segment,
          visual: narrationSegments[i].segment,
          animation: visualSegments[i].segment,
        });
      }
    } catch (err) {
      throw new HttpException(
        'Failed to parse segmentation JSON.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { segments: segments, artStyle: script.artStyle };
  }

  async segmentScript(
    segmentationDto: SegmentationDto,
    userId: string,
  ): Promise<{
    segments: TypeSegment[];
    artStyle: string;
    model: string;
    credits: {
      used: number;
      balance: number;
    };
  }> {
    // Use projectId from body if provided, otherwise ensure user has a project (create default if none exists)
    const projectId = segmentationDto.projectId
      ? segmentationDto.projectId
      : await this.projectHelperService.ensureUserHasProject(userId);
    console.log(`Using project ${projectId} for segmentation`);

    // ===== CREDIT DEDUCTION =====
    console.log(`Deducting credits for script segmentation`);

    // Deduct credits first - this handles validation internally
    let creditTransactionId = await this.creditService.deductCredits(
      userId,
      'TEXT_OPERATIONS',
      'segmentation',
      `segmentation-${Date.now()}`,
      false, // we'll handle edit calls separately if needed
      `Script segmentation with AI models`,
    );

    console.log(
      `Successfully deducted credits for segmentation. Transaction ID: ${creditTransactionId}`,
    );
    // ===== END CREDIT DEDUCTION =====

    // Determine Gemini model variant based on user input (default to pro)
    const geminiModel =
      segmentationDto.model === 'flash'
        ? 'gemini-2.5-flash'
        : 'gemini-2.5-pro-preview-06-05';


    try {

      try {

        let script: {
          narration: string;
          visual: string;
          animation: string;
          artStyle: string;
        };
        let modelUsed: string;

        // Extract concept from the prompt
        const concept = segmentationDto.concept || '';

        // Generate script based on selected model
        if (segmentationDto.model === 'flash') {
          script = await this.generateScriptWithGemini({
            animationPrompt: `Create an animation sequence for a video about: "${segmentationDto.prompt}". The animation should be engaging and well-paced. Structure the animation into exactly 5 parts that flow naturally. Include specific animation cues and transitions. Focus on the animation flow and visual storytelling.`,
            narrationPrompt: `Write a voiceover script for a video about: "${segmentationDto.prompt}". The script should be engaging, clear, and well-structured. Structure the script into exactly 5 distinct segments. Each segment should be standalone and flow naturally into the next. Focus on clear, compelling narration.`,
            visualPrompt: `Generate a visual concept for a video about: "${segmentationDto.prompt}". Create descriptions for 5 distinct visual segments, each representing a single, cohesive image concept. Each image should be visually compelling and support the overall narrative. Focus on visual composition and storytelling.`,
            concept: concept,
            negativePrompt: segmentationDto.negative_prompt,
            model: geminiModel,
          });
          modelUsed = 'gemini-2.5-pro';
        } else if (segmentationDto.model === 'openai') {
          script = await this.generateScriptWithOpenAI({
            animationPrompt: `Create an animation sequence for a video about: "${segmentationDto.prompt}". The animation should be engaging and well-paced. Structure the animation into exactly 5 parts that flow naturally. Include specific animation cues and transitions. Focus on the animation flow and visual storytelling.`,
            narrationPrompt: `Write a voiceover script for a video about: "${segmentationDto.prompt}". The script should be engaging, clear, and well-structured. Structure the script into exactly 5 distinct segments. Each segment should be standalone and flow naturally into the next. Focus on clear, compelling narration.`,
            visualPrompt: `Generate a visual concept for a video about: "${segmentationDto.prompt}". Create descriptions for 5 distinct visual segments, each representing a single, cohesive image concept. Each image should be visually compelling and support the overall narrative. Focus on visual composition and storytelling.`,
            concept: concept,
            negativePrompt: segmentationDto.negative_prompt,
          });
          modelUsed = 'gpt-4o';
        } else {
          throw new BadRequestException('Invalid model specified. Choose either "gemini" or "openai".');
        }

        // const geminiParseRes = await this.genAI.models.generateContent({
        //   model: 'gemini-2.0-flash-exp',
        //   contents: `Parse this entire agent conversation output and extract the script, style, and model information. Return a JSON object with "script" (containing "narration", "visual", and "animation" fields), "artStyle", and "model" (the AI model used for script generation).

        //   Full agent output:
        //   ${JSON.stringify(script, null, 2)}`,
        //   config: {
        //     responseMimeType: 'application/json',
        //     responseSchema: {
        //       type: 'object',
        //       properties: {
        //         script: {
        //           type: 'object',
        //           properties: {
        //             narration: { type: 'string' },
        //             visual: { type: 'string' },
        //             animation: { type: 'string' },
        //           },
        //           required: ['narration', 'visual', 'animation'],
        //         },
        //         artStyle: { type: 'string' },
        //         model: { type: 'string' },
        //       },
        //       required: ['script', 'artStyle', 'model'],
        //     },
        //   },
        // } as any);

          // const agentResult = JSON.parse(geminiParseRes.text);
          // console.log(agentResult);

          // Segment the generated script

          const segmentedScript = await this.segmentGeneratedScript({
            ...script,
            negative_prompt: segmentationDto.negative_prompt,
            model: modelUsed,
          });

          // Save to database
          console.log(`Saving segmentation to database`);
          const savedSegmentation = await this.prisma.videoSegmentation.create({
            data: {
              prompt: segmentationDto.prompt,
              concept: segmentationDto.concept,
              negativePrompt: segmentationDto.negative_prompt,
              artStyle: script.artStyle,
              model: modelUsed,
              projectId,
              userId,
              // Add credit tracking
              creditTransactionId: creditTransactionId,
              creditsUsed: new Decimal(3), // Segmentation uses fixed pricing
            },
          });

          // Save individual segments
          const savedSegments = await Promise.all(
            segmentedScript.segments.map(async (segment, index) => {
              return await this.prisma.videoSegment.create({
                data: {
                  segmentId: `${index + 1}`,
                  visual: segment.visual,
                  narration: segment.narration,
                  animation: segment.animation,
                  videoSegmentationId: savedSegmentation.id,
                },
              });
            }),
          );

          // Save conversation history
          await this.prisma.conversationHistory.create({
            data: {
              type: 'VIDEO_SEGMENTATION',
              userInput: segmentationDto.prompt,
              response: JSON.stringify({
                segments: segmentedScript.segments,
                artStyle: script.artStyle,
                model: modelUsed,
              }),
              metadata: {
                concept: segmentationDto.concept,
                negativePrompt: segmentationDto.negative_prompt,
                segmentCount: segmentedScript.segments.length,
                savedSegmentationId: savedSegmentation.id,
                savedSegmentIds: savedSegments.map((s) => s.id),
              },
              projectId,
              userId,
            },
          });

          console.log(
            `Successfully saved segmentation: ${savedSegmentation.id} with ${savedSegments.length} segments`,
          );

          // Get user's new balance after credit deduction
          const newBalance = await this.creditService.getUserBalance(userId);

          return {
            segments: segmentedScript.segments,
            artStyle: script.artStyle,
            model: modelUsed,
            credits: {
              used: 3, // Segmentation uses fixed pricing
              balance: newBalance.toNumber(),
            },
          };
      } catch (parseError) {
        console.error('Failed to parse agent result with Gemini:', parseError);
      }

      throw new HttpException(
        'Agent did not produce a valid script.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } catch (error) {
      console.error('Error during agent execution:', error);

      // Refund credits if they were deducted
      if (creditTransactionId) {
        try {
          await this.creditService.refundCredits(
            userId,
            'TEXT_OPERATIONS',
            'segmentation',
            `segmentation-${Date.now()}`,
            creditTransactionId,
            false,
            `Refund for failed segmentation: ${error.message}`,
          );
          console.log(
            `Successfully refunded 3 credits for failed segmentation. User: ${userId}`,
          );
        } catch (refundError) {
          console.error(
            `Failed to refund credits for segmentation: ${refundError.message}`,
          );
        }
      }

      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'An unexpected error occurred.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all video segmentations for a user, optionally filtered by project
   */
  async getAllSegmentations(userId: string, projectId?: string) {
    try {
      const where = {
        userId,
        ...(projectId && { projectId }),
      };

      const segmentations = await this.prisma.videoSegmentation.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          segments: {
            orderBy: {
              segmentId: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log(
        `Retrieved ${segmentations.length} video segmentations for user ${userId}${projectId ? ` in project ${projectId}` : ''
        }`,
      );

      return {
        success: true,
        count: segmentations.length,
        segmentations,
      };
    } catch (error) {
      console.error(`Failed to retrieve segmentations: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve segmentations: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a specific video segmentation by ID for a user
   */
  async getSegmentationById(segmentationId: string, userId: string) {
    try {
      const segmentation = await this.prisma.videoSegmentation.findFirst({
        where: {
          id: segmentationId,
          userId, // Ensure user can only access their own segmentations
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          segments: {
            orderBy: {
              segmentId: 'asc',
            },
          },
        },
      });

      if (!segmentation) {
        throw new NotFoundException(
          `Video segmentation with ID ${segmentationId} not found or you don't have access to it`,
        );
      }

      console.log(
        `Retrieved video segmentation ${segmentationId} for user ${userId}`,
      );

      // Transform segments to match the expected format
      const transformedSegments = segmentation.segments.map((segment) => ({
        id: segment.segmentId,
        visual: segment.visual,
        narration: segment.narration,
        animation: segment.animation,
      }));

      return {
        success: true,
        segmentation: {
          ...segmentation,
          segments: transformedSegments,
        },
      };
    } catch (error) {
      console.error(
        `Failed to retrieve segmentation ${segmentationId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Failed to retrieve segmentation: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Select a segmentation (supports multiple selections per project)
   * This allows users to select multiple segmentations throughout their iterative workflow
   */
  async selectSegmentation(
    segmentationId: string,
    userId: string,
    projectId?: string,
  ) {
    try {
      const segmentation = await this.prisma.videoSegmentation.findFirst({
        where: {
          id: segmentationId,
          userId,
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

      if (!segmentation) {
        throw new NotFoundException(
          `Video segmentation with ID ${segmentationId} not found or you don't have access to it`,
        );
      }

      // Select the current segmentation without deselecting others
      // This supports the iterative workflow where multiple segmentations can be selected per project
      const updatedSegmentation = await this.prisma.videoSegmentation.update({
        where: {
          id: segmentationId,
        },
        data: {
          isSelected: true,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          segments: {
            orderBy: {
              segmentId: 'asc',
            },
          },
        },
      });

      console.log(
        `Selected segmentation ${segmentationId} for user ${userId} - supports multiple selections per project`,
      );

      return {
        success: true,
        message: 'Segmentation selected successfully',
        segmentation: updatedSegmentation,
      };
    } catch (error) {
      console.error(
        `Failed to select segmentation ${segmentationId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Failed to select segmentation: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update a specific segmentation by ID for a user
   */
  async updateSegmentation(
    segmentationId: string,
    updateData: any,
    userId: string,
  ) {
    try {
      // First check if the segmentation exists and belongs to the user
      const existingSegmentation =
        await this.prisma.videoSegmentation.findFirst({
          where: {
            id: segmentationId,
            userId, // Ensure user can only update their own segmentations
          },
        });

      if (!existingSegmentation) {
        throw new NotFoundException(
          `Segmentation with ID ${segmentationId} not found or you don't have access to it`,
        );
      }

      // Prepare update data - only include fields that are provided
      const updateFields: any = {};
      if (updateData.prompt !== undefined) {
        updateFields.prompt = updateData.prompt;
      }
      if (updateData.concept !== undefined) {
        updateFields.concept = updateData.concept;
      }
      if (updateData.negative_prompt !== undefined) {
        updateFields.negativePrompt = updateData.negative_prompt;
      }
      if (updateData.projectId !== undefined) {
        updateFields.projectId = updateData.projectId;
      }

      // Update the segmentation
      const updatedSegmentation = await this.prisma.videoSegmentation.update({
        where: {
          id: segmentationId,
        },
        data: updateFields,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          segments: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      console.log(`Updated segmentation ${segmentationId} for user ${userId}`);

      // Log the update in conversation history
      await this.prisma.conversationHistory.create({
        data: {
          type: 'VIDEO_SEGMENTATION',
          userInput: `Updated segmentation ${segmentationId}`,
          response: JSON.stringify({
            action: 'update_segmentation',
            segmentationId,
            updatedFields: updateFields,
            oldValues: {
              prompt: existingSegmentation.prompt,
              concept: existingSegmentation.concept,
              negativePrompt: existingSegmentation.negativePrompt,
            },
          }),
          metadata: {
            action: 'update',
            segmentationId,
            updatedFields: Object.keys(updateFields),
          },
          projectId: updatedSegmentation.projectId,
          userId,
        },
      });

      return {
        success: true,
        message: 'Segmentation updated successfully',
        segmentation: updatedSegmentation,
      };
    } catch (error) {
      console.error(
        `Failed to update segmentation ${segmentationId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException(
        `Failed to update segmentation: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
