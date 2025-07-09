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
    animationPrompt: string;
  }): Promise<{ narration: string; visual: string; animation: string }> {
    const { narrationPrompt, visualPrompt, animationPrompt } = options;

    const [animationRes, narrationRes, visualRes] = await Promise.all([
      this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: animationPrompt,
      }),
      this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: narrationPrompt,
      }),
      this.genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: visualPrompt,
      }),
    ]);

    const animation = animationRes.text?.trim();
    const narration = narrationRes.text?.trim();
    const visual = visualRes.text?.trim();

    if (!animation || !narration || !visual) {
      throw new HttpException(
        'Failed to generate full script.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // console.log(`ANIMATION: ${animation}`);
    // console.log(`NARRATION: ${narration}`);
    // console.log(`VISUAL: ${visual}`);

    return { narration, visual, animation };
  }

  private async segmentGeneratedScript(script: {
    narration: string;
    visual: string;
    animation: string;
  }): Promise<{ segments: TypeSegment[] }> {
    const makeSegmentationPrompt = (
      scriptText: string,
      type: 'narration' | 'visual' | 'animation',
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
      `;

      const animationAddendum = `
      IMPORTANT (for animation scripts):
      Each segment should describe motion and transitions for one continuous shot.
      Avoid visual summaries or multiple scene ideas per segment.
      Only describe how the camera moves, how things animate, and what’s happening dynamically on screen.
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
        model: 'gemini-2.5-pro-preview-06-05',
        contents: makeSegmentationPrompt(script.narration, 'narration'),
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
        model: 'gemini-2.5-pro-preview-06-05',
        contents: makeSegmentationPrompt(script.visual, 'visual'),
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
        model: 'gemini-2.5-pro-preview-06-05',
        contents: makeSegmentationPrompt(script.animation, 'animation'),
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
    //   console.log(`ANIMATION: ${animationSegRes.text}`);
    //   console.log(`NARRATION: ${narrationSegRes.text}`);
    //   console.log(`VISUAL: ${visualSegRes.text}`);
      const narrationSegments = JSON.parse(narrationSegRes.text);
      const visualSegments = JSON.parse(visualSegRes.text);
      const animationSegments = JSON.parse(animationSegRes.text);
      for (let i = 0; i <= 4; i++) {
        segments.push({
          id: `seg-${i + 1}`,
          narration: animationSegments[i].segment, // narration ← animation
          visual: narrationSegments[i].segment,    // visual ← narration
          animation: visualSegments[i].segment,    // animation ← visual
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
                animationPrompt: `Create a high-energy animation sequence for a hype video about: "${prompt}". The animation should feel intense, cinematic, and adrenaline-fueled. Use strong pacing like quick cuts, bold transitions, and powerful motion to build excitement. Structure the animation into exactly 5 parts, each escalating in impact. Clearly label each part. Include pacing cues like "build-up", "burst", "climax", etc. Avoid summaries; focus on the animation flow.`,

                narrationPrompt: `Write a high-octane voiceover script for a hype video about: "${prompt}". Use short, punchy lines with energetic verbs and emotional intensity. The tone should be motivational, fast-paced, and powerful — something that gets crowds hyped. Structure the script into exactly 5 distinct segments. Do not label them as "summary" or include narration summaries. Each segment should stand alone with a strong voice.`,

                visualPrompt: `Generate a concept description for creating a single impactful image per segment for a hype video based on: "${prompt}". Each image should be bold, cinematic, and emotionally intense — think strong silhouettes, dynamic scenes, action energy, or surreal metaphors. Divide the visual plan into exactly 5 parts, one image per part. Describe the visual content clearly for each image without using terms like "storyboard" or "summary". Maintain consistency in visual tone and escalation.`,
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
                animationPrompt: `Create a polished animation storyboard for a professional ad video about: "${prompt}". The animation should feel sleek, smooth, and brand-friendly — think product reveals, clean transitions, and confident pacing. Structure the animation into exactly 5 clear segments such as: Introduction, Problem, Solution, Benefits, Call to Action. Label each part and specify animation dynamics (e.g. fade-in text, motion highlights). Avoid summaries — describe actual animation intent.`,

                narrationPrompt: `Write a persuasive, professional voiceover script for an advertisement video on: "${prompt}". Keep the tone clear, trustworthy, and motivating. Use crisp, concise sentences with an engaging flow. Divide the narration into exactly 5 labeled parts that follow a marketing arc (e.g. Hook, Need, Offer, Advantage, CTA). Each part should be standalone — avoid any summary language or recap phrasing.`,

                visualPrompt: `Describe 5 standalone visuals, one per segment, for an ad video about: "${prompt}". Each image should represent a clean, modern, brand-aligned scene — such as a product hero shot, customer lifestyle, or UI mockup. Describe each image clearly and concisely. Do not create storyboards or multiple scenes per part. Each segment should yield one cohesive image that complements the narration.`,
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
                    animation: { type: 'string' },
                  },
                  required: ['narration', 'visual', 'animation'],
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
