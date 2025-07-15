import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { SegmentationDto } from './dto/segmentation.dto';
import { TypeSegment } from './segment.interface';
import { Agent, tool, handoff, run } from '@openai/agents';
import { z } from 'zod';
import OpenAI from 'openai';

@Injectable()
export class SegmentationService {
  private readonly genAI: GoogleGenAI;
  private readonly openai: OpenAI;

  constructor() {
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
  }): Promise<{
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
  }> {
    const { narrationPrompt, visualPrompt, animationPrompt } = options;

    const [animationRes, narrationRes, visualRes, artStyleRes] =
      await Promise.all([
        this.genAI.models.generateContent({
          model: 'gemini-2.5-pro-preview-06-05',
          contents: animationPrompt,
        }),
        this.genAI.models.generateContent({
          model: 'gemini-2.5-pro-preview-06-05',
          contents: narrationPrompt,
        }),
        this.genAI.models.generateContent({
          model: 'gemini-2.5-pro-preview-06-05',
          contents: visualPrompt,
        }),
        this.genAI.models.generateContent({
          model: 'gemini-2.5-pro-preview-06-05',
          contents: `VISUAL PROMPT: ${visualPrompt} \n ANIMATION PROMPT: ${animationPrompt}. \n Your task is to generate a art style prompt using the visual prompt and animation prompt. This is to maintain consistency in the visual and animation style. If there's a person involved in the visual, make sure to mention the looks of the person in the art style prompt.
        
        Example Style Prompt for a face wash ad that is minimal:
        showcase the natural and alovera related positives of the face wash product using minimalistic branding and light colors. The face wash has a white colour pack and consists of a skin enhancing lotion made o alovera and natural ingrideints. Use water and fluid elements to portray freshness.

        Keep this style prompt as short as possible. Must be within 300 characters.
        `,
        }),
      ]);

    const animation = animationRes.text?.trim();
    const narration = narrationRes.text?.trim();
    const visual = visualRes.text?.trim();
    const artStyle = artStyleRes.text?.trim();

    if (!animation || !narration || !visual) {
      throw new HttpException(
        'Failed to generate full script with Gemini.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { narration, visual, animation, artStyle };
  }

  private async generateScriptWithOpenAI(options: {
    narrationPrompt: string;
    visualPrompt: string;
    animationPrompt: string;
  }): Promise<{
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
  }> {
    const { narrationPrompt, visualPrompt, animationPrompt } = options;

    const [animationRes, narrationRes, visualRes, artStyleRes] =
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
          messages: [{ role: 'user', content: visualPrompt }],
        }),
        this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: `VISUAL PROMPT: ${visualPrompt} \n ANIMATION PROMPT: ${animationPrompt}. \n Your task is to generate a art style prompt using the visual prompt and animation prompt. This is to maintain consistency in the visual and animation style. If there's a person involved in the visual, make sure to mention the looks of the person in the art style prompt.
        
        Example Style Prompt for a face wash ad that is minimal:
        showcase the natural and alovera related positives of the face wash product using minimalistic branding and light colors. The face wash has a white colour pack and consists of a skin enhancing lotion made o alovera and natural ingrideints. Use water and fluid elements to portray freshness.

        Keep this style prompt as short as possible. Must be within 300 characters.
        ` }],
        }),
      ]);

    const animation = animationRes.choices[0]?.message?.content?.trim();
    const narration = narrationRes.choices[0]?.message?.content?.trim();
    const visual = visualRes.choices[0]?.message?.content?.trim();
    const artStyle = artStyleRes.choices[0]?.message?.content?.trim();

    if (!animation || !narration || !visual) {
      throw new HttpException(
        'Failed to generate full script with OpenAI.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { narration, visual, animation, artStyle };
  }

  private async segmentGeneratedScript(script: {
    narration: string;
    visual: string;
    animation: string;
    artStyle: string;
    negative_prompt: string;
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
        model: 'gemini-2.5-pro-preview-06-05',
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
        model: 'gemini-2.5-pro-preview-06-05',
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
        model: 'gemini-2.5-pro-preview-06-05',
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

  async segmentScript(segmentationDto: SegmentationDto): Promise<{
    segments: TypeSegment[];
    artStyle: string;
    model: string;
  }> {
    const createGeminiAgent = () =>
      new Agent<{ prompt: string; negative_prompt: string }>({
        name: 'Gemini Script Generation Agent',
        instructions:
          'You create high-quality scripts using Gemini 2.5 Pro model. You excel at creative content generation, detailed analysis, and comprehensive script development.',
        tools: [
          tool({
            name: 'generate_script_with_gemini',
            description: 'Generate script using Gemini 2.5 Pro model.',
            parameters: z.object({
              prompt: z.string(),
              negative_prompt: z.string(),
            }) as any,
            execute: async ({ prompt, negative_prompt }) => {
              const script = await this.generateScriptWithGemini({
                animationPrompt: `Create an animation sequence for a video about: "${prompt}". The animation should be engaging and well-paced. Structure the animation into exactly 5 parts that flow naturally. Include specific animation cues and transitions. Focus on the animation flow and visual storytelling.`,

                narrationPrompt: `Write a voiceover script for a video about: "${prompt}". The script should be engaging, clear, and well-structured. Structure the script into exactly 5 distinct segments. Each segment should be standalone and flow naturally into the next. Focus on clear, compelling narration.`,

                visualPrompt: `Generate a visual concept for a video about: "${prompt}". Create descriptions for 5 distinct visual segments, each representing a single, cohesive image concept. Each image should be visually compelling and support the overall narrative. Focus on visual composition and storytelling.`,
              });
                             return { script, model: 'gemini-2.5-pro' };
            },
          }),
        ],
      });

    const createOpenAIAgent = () =>
      new Agent<{ prompt: string; negative_prompt: string }>({
        name: 'OpenAI Script Generation Agent',
        instructions:
          'You create high-quality scripts using OpenAI GPT-4o model. You excel at natural language processing, creative writing, and structured content generation.',
        tools: [
          tool({
            name: 'generate_script_with_openai',
            description: 'Generate script using OpenAI GPT-4o model.',
            parameters: z.object({
              prompt: z.string(),
              negative_prompt: z.string(),
            }) as any,
            execute: async ({ prompt, negative_prompt }) => {
              const script = await this.generateScriptWithOpenAI({
                animationPrompt: `Create an animation sequence for a video about: "${prompt}". The animation should be engaging and well-paced. Structure the animation into exactly 5 parts that flow naturally. Include specific animation cues and transitions. Focus on the animation flow and visual storytelling.`,

                narrationPrompt: `Write a voiceover script for a video about: "${prompt}". The script should be engaging, clear, and well-structured. Structure the script into exactly 5 distinct segments. Each segment should be standalone and flow naturally into the next. Focus on clear, compelling narration.`,

                visualPrompt: `Generate a visual concept for a video about: "${prompt}". Create descriptions for 5 distinct visual segments, each representing a single, cohesive image concept. Each image should be visually compelling and support the overall narrative. Focus on visual composition and storytelling.`,
              });
                             return { script, model: 'gpt-4o' };
            },
          }),
        ],
      });

    const GeminiAgent = createGeminiAgent();
    const OpenAIAgent = createOpenAIAgent();

    const triageAgent = Agent.create({
      name: 'Script Generation Triage Agent',
      instructions: `
      You are a script generation assistant that decides which AI model to use based on the prompt characteristics and requirements.
      
      Use Gemini 2.5 Pro for:
      - Creative and artistic content
      - Complex visual descriptions
      - Detailed narrative development
      - Multi-layered storytelling
      - Content requiring deep contextual understanding
      
      Use OpenAI GPT-4o for:
      - Technical or professional content
      - Structured information delivery
      - Clear, concise communication
      - Business or educational content
      - Content requiring precise language
      
      Analyze the prompt and choose the appropriate model, then hand off to the corresponding agent.`,
      handoffs: [
        handoff(GeminiAgent, {
          toolNameOverride: 'use_gemini_agent',
          toolDescriptionOverride: 'Send to Gemini agent for creative/artistic content.',
        }),
        handoff(OpenAIAgent, {
          toolNameOverride: 'use_openai_agent',
          toolDescriptionOverride: 'Send to OpenAI agent for technical/professional content.',
        }),
      ],
    });

    try {
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `PROMPT: ${segmentationDto.prompt} \n NEGATIVE PROMPT: ${segmentationDto.negative_prompt}`,
        },
      ]);

      try {
        const geminiParseRes = await this.genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: `Parse this entire agent conversation output and extract the script, style, and model information. Return a JSON object with "script" (containing "narration", "visual", and "animation" fields), "artStyle", and "model" (the AI model used for script generation).

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
                artStyle: { type: 'string' },
                model: { type: 'string' },
              },
              required: ['script', 'artStyle', 'model'],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);
        console.log(agentResult);

        if (agentResult?.script && agentResult?.artStyle) {
          const segmentedScript = await this.segmentGeneratedScript({
            ...agentResult.script,
            negative_prompt: segmentationDto.negative_prompt,
          });

          return {
            segments: segmentedScript.segments,
            artStyle: agentResult.artStyle,
            model: agentResult.model,
          };
        }
      } catch (parseError) {
        console.error('Failed to parse agent result with Gemini:', parseError);
      }

      throw new HttpException(
        'Agent did not produce a valid script.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } catch (error) {
      console.error('Error during agent execution:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'An unexpected error occurred.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
