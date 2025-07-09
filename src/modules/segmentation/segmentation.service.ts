import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { SegmentationDto } from './dto/segmentation.dto';
import { TypeSegment } from './segment.interface';
import { Agent, tool, handoff, run, RunResult } from '@openai/agents';
import { z } from 'zod';

@Injectable()
export class SegmentationService {
  private readonly genAI: GoogleGenAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set.');
    }
    this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private async generateScript(options: {
    narrationPrompt: string;
    visualPrompt: string;
  }): Promise<{ narration: string; visual: string }> {
    const { narrationPrompt, visualPrompt } = options;

    const narrationRes = await this.genAI.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: narrationPrompt,
    });

    const narration = narrationRes.text?.trim();
    if (!narration) {
      throw new HttpException(
        'Failed to generate narration.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const visualRes = await this.genAI.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: visualPrompt,
    });

    const visual = visualRes.text?.trim();
    if (!visual) {
      throw new HttpException(
        'Failed to generate visual script.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { narration, visual };
  }

  private async segmentGeneratedScript(script: {
    narration: string;
    visual: string;
  }): Promise<{ segments: TypeSegment[] }> {
    const makeSegmentationPrompt = (scriptText: string) => `
          Segment the following script into exactly 5 distinct parts. Narration and visual should be in the same order. IT SHOULD BE EXACTLY 5 PARTS. Each part should be an object with a "segment" field (text of that part), and a unique "id" field.
          EACH VISUAL PROMPT CAN BE A MAXIMUM OF 150 WORDS PER SEGMENT.
          Script:
          ---
          ${scriptText}
          ---
      `;

    const narrationSegRes = await this.genAI.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: makeSegmentationPrompt(script.narration),
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
    });

    const visualSegRes = await this.genAI.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: makeSegmentationPrompt(script.visual),
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
    });

    const segments: TypeSegment[] = [];

    try {
      const narrationSegments = JSON.parse(narrationSegRes.text);
      const visualSegments = JSON.parse(visualSegRes.text);
      for (let i = 0; i <= 4; i++) {
        segments.push({
          id: `seg-${i + 1}`,
          narration: narrationSegments[i].segment,
          visual: visualSegments[i].segment,
        });
      }
    } catch (err) {
      throw new HttpException(
        'Failed to parse segmentation JSON.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { segments };
  }

  async segmentScript(segmentationDto: SegmentationDto): Promise<{
    segments: TypeSegment[];
    style: 'hype' | 'ad';
  }> {
    const createHypeAgent = () =>
      new Agent<{ prompt: string }>({
        name: 'Hype Video Agent',
        instructions:
          'You create fast-paced, high-energy hype videos that get people pumped up. Use bold visuals and powerful, energetic narration.',
        tools: [
          tool({
            name: 'generate_hype_video',
            description:
              'Generate a fast-paced, high-energy hype video from a user prompt.',
            parameters: z.object({
              prompt: z.string(),
            }) as any,
            execute: async ({ prompt }) => {
              console.log(
                `[HYPE] Starting hype video generation for: ${prompt}`,
              );
              const script = await this.generateScript({
                narrationPrompt: `Create a high-octane, adrenaline-pumping voiceover script for: ${prompt}. Use short sentences, punchy verbs, and crowd-rallying phrases.`,
                visualPrompt: `Generate a visual script for a concept art that will be used as reference to generate a hype video: ${prompt}`,
              });
              // Return the full script and style only - NOT segmented yet
              return { script, style: 'hype' };
            },
          }),
        ],
      });

    const createAdAgent = () =>
      new Agent<{ prompt: string }>({
        name: 'Ad Video Agent',
        instructions:
          'You create professional, sleek promotional videos that highlight products, services, or ideas in a clean and marketable way.',
        tools: [
          tool({
            name: 'generate_ad_video',
            description: 'Generate a clean and polished promotional ad video.',
            parameters: z.object({
              prompt: z.string(),
            }) as any,
            execute: async ({ prompt }) => {
            //   console.log(`[AD] Starting ad video generation for: ${prompt}`);
              const script = await this.generateScript({
                narrationPrompt: `Write a clear, persuasive product ad script for: ${prompt}. Focus on key features, benefits, and a strong call to action. Keep it brand-friendly and concise.`,
                visualPrompt: `Generate a visual script for a concept art that will be used as reference to generate an ad video: ${prompt}`,
              });
              // Return the full script and style only - NOT segmented yet
              return { script, style: 'ad' };
            },
          }),
        ],
      });

    const HypeAgent = createHypeAgent();
    const AdAgent = createAdAgent();

    const triageAgent = Agent.create({
      name: 'Triage Agent',
      instructions: `
      You are a video director assistant.
      Based on the user's input prompt, decide the best style and hand off:
      - Hype for excitement
      - Ad for product promotions
      
      IMPORTANT: After handoff, include the generated script in your response.`,
      handoffs: [
        handoff(HypeAgent, {
          toolNameOverride: 'use_hype_tool',
          toolDescriptionOverride: 'Send to hype video agent.',
        }),
        handoff(AdAgent, {
          toolNameOverride: 'use_ad_tool',
          toolDescriptionOverride: 'Send to ad video agent.',
        }),
      ],
    });

    try {
      // Use agent only to determine style and generate full script
      const result = await run(triageAgent, [
        { role: 'user', content: segmentationDto.prompt },
      ]);
      console.dir(result.output, { depth: null });

      try {
        // Use Gemini Flash to parse the entire agent output
        const geminiParseRes = await this.genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: `Parse this entire agent conversation output and extract the script and style information. Return a JSON object with "script" (containing "narration" and "visual" fields) and "style" (either "hype" or "ad").

Full agent output:
${JSON.stringify(result.output, null, 2)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                script: {
                  type: 'object',
                  properties: {
                    narration: { type: 'string' },
                    visual: { type: 'string' },
                  },
                  required: ['narration', 'visual'],
                },
                style: {
                  type: 'string',
                  enum: ['hype', 'ad'],
                },
              },
              required: ['script', 'style'],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);

        if (agentResult?.script && agentResult?.style) {
          // Agent generated the script successfully, now segment it
        //   console.log(
        //     `Segmenting ${agentResult.style} script for: ${segmentationDto.prompt}`,
        //   );
          const segmentedScript = await this.segmentGeneratedScript(
            agentResult.script,
          );

          // Return segmented script with style
          return {
            segments: segmentedScript.segments,
            style: agentResult.style,
          };
        }
      } catch (parseError) {
        console.error('Failed to parse agent result with Gemini:', parseError);
      }

      // If we got here, something went wrong with the agent's output
      throw new HttpException(
        'Agent did not produce a valid script.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } catch (error) {
      console.error('Error during agent execution:', error);
      // Just throw the error, no fallback
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'An unexpected error occurred.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
