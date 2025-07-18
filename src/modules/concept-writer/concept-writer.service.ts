import { Injectable, Logger } from '@nestjs/common';
import { ConceptWriterDto } from './dto/concept-writer.dto';
import { GoogleGenAI } from '@google/genai';
import { GeneratedResponse } from './concept-writer.interface';

@Injectable()
export class ConceptWriterService {
  private gemini: GoogleGenAI;
  private readonly logger = new Logger(ConceptWriterService.name);

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set.');
    }
    this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async getConcept(
    conceptWriterDto: ConceptWriterDto,
  ): Promise<GeneratedResponse> {
    const { prompt, web_info } = conceptWriterDto;

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

    try {
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
        
        if (!parsed.concepts || !Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
          throw new Error('Invalid response structure: missing or empty concepts array');
        }

        return parsed;
      } catch (parseError) {
        this.logger.error(`JSON parsing error: ${parseError.message}`);
        this.logger.error(`Attempted to parse: ${text}`);
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to generate concepts: ${error.message}`);
      throw new Error(`Failed to generate concepts: ${error.message}`);
    }
  }
}
