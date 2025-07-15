import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import RunwayML from '@runwayml/sdk';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { VideoGenDto } from './dto/video-gen.dto';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { Agent, tool, handoff, run } from '@openai/agents';
import { z } from 'zod';

interface VideoGenerationResult {
  s3Keys: string[];
  model: string;
  totalVideos: number;
}

@Injectable()
export class VideoGenService {
  private readonly logger = new Logger(VideoGenService.name);
  private readonly genAI: GoogleGenAI;
  private readonly s3Client: S3Client;
  private readonly runwayClient: RunwayML;

  constructor() {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable not set.');
      }
      if (!process.env.RUNWAYML_API_KEY) {
        throw new Error('RUNWAYML_API_KEY environment variable not set.');
      }
      if (
        !process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY ||
        !process.env.AWS_REGION
      ) {
        throw new Error('AWS credentials environment variables not set.');
      }
      if (!process.env.S3_BUCKET_NAME) {
        throw new Error('S3_BUCKET_NAME environment variable not set.');
      }

      this.genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      this.runwayClient = new RunwayML({ apiKey: process.env.RUNWAYML_API_KEY });

      this.s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      this.logger.log('Google AI, RunwayML, and S3 clients configured successfully');
    } catch (error) {
      this.logger.error('Failed to initialize VideoGenService', error.stack);
      throw error;
    }
  }

  async generateVideo(videoGenDto: VideoGenDto) {
    const startTime = Date.now();
    this.logger.log(
      `Starting video generation request for user: ${videoGenDto.uuid}`,
    );
    this.logger.log(
      `Starting video generation request for user: ${videoGenDto.art_style}`,
    );
    this.logger.debug(`Animation prompt: ${videoGenDto.animation_prompt}`);
    this.logger.debug(`Image S3 key: ${videoGenDto.imageS3Key}`);

    const createVeo2Agent = () =>
      new Agent<{
        animation_prompt: string;
        art_style: string;
        imageS3Key: string;
        uuid: string;
      }>({
        name: 'Veo2 Cartoonish Video Agent',
        instructions:
          'You create cartoonish, animated, and stylized videos using Veo2 model. Perfect for animated content, cartoon-style visuals, and non-realistic creative videos.',
        tools: [
          tool({
            name: 'generate_veo2_video',
            description: 'Generate cartoonish/animated video using Veo2 model.',
            parameters: z.object({
              animation_prompt: z.string(),
              imageS3Key: z.string(),
              art_style: z.string(),
              uuid: z.string(),
            }) as any,
            execute: async ({
              animation_prompt,
              art_style,
              imageS3Key,
              uuid,
            }) => {
              this.logger.log(
                'Agent selected Veo2 for cartoonish/animated content',
              );
              return await this.generateVeo2Video(
                animation_prompt,
                art_style,
                imageS3Key,
                uuid,
              );
            },
          }),
        ],
      });

    const createRunwayMLAgent = () =>
      new Agent<{
        animation_prompt: string;
        art_style: string;
        imageS3Key: string;
        uuid: string;
      }>({
        name: 'RunwayML Realistic Video Agent',
        instructions:
          'You create realistic, high-quality videos using RunwayML Gen-3 Alpha Turbo model. Perfect for realistic content, human subjects, photorealistic scenes, and professional video generation.',
        tools: [
          tool({
            name: 'generate_runwayml_video',
            description:
              'Generate realistic/high-quality video using RunwayML Gen-3 Alpha Turbo model.',
            parameters: z.object({
              animation_prompt: z.string(),
              imageS3Key: z.string(),
              art_style: z.string(),
              uuid: z.string(),
            }) as any,
            execute: async ({
              animation_prompt,
              art_style,
              imageS3Key,
              uuid,
            }) => {
              this.logger.log(
                'Agent selected RunwayML for realistic/high-quality content',
              );
              return await this.generateRunwayMLVideo(
                animation_prompt,
                art_style,
                imageS3Key,
                uuid,
              );
            },
          }),
        ],
      });

    const Veo2Agent = createVeo2Agent();
    const RunwayMLAgent = createRunwayMLAgent();

    const triageAgent = Agent.create({
      name: 'Video Generation Triage Agent',
      instructions: `
      You are a video generation assistant that decides which model to use based on the prompt.
      
      Use Veo2 for:
      - Cartoonish, animated, or stylized content
      - 2D/3D animations
      - Artistic or abstract visuals
      - Non-realistic creative content
      - Experimental or artistic styles
      
      Use RunwayML for:
      - Realistic, photographic content
      - Human subjects and real-world scenes
      - Professional video content
      - High-quality cinematic videos
      - Documentary-style content
      - Photorealistic animations
      - Commercial or marketing videos
      
      Analyze the prompt and choose the appropriate model, then hand off to the corresponding agent.`,
      handoffs: [
        handoff(Veo2Agent, {
          toolNameOverride: 'use_veo2_agent',
          toolDescriptionOverride:
            'Send to Veo2 agent for cartoonish/animated content.',
        }),
        handoff(RunwayMLAgent, {
          toolNameOverride: 'use_runwayml_agent',
          toolDescriptionOverride:
            'Send to RunwayML agent for realistic/high-quality content.',
        }),
      ],
    });

    try {
      if (
        !videoGenDto.animation_prompt ||
        !videoGenDto.imageS3Key ||
        !videoGenDto.uuid
      ) {
        this.logger.error('Missing required fields in request', {
          hasPrompt: !!videoGenDto.animation_prompt,
          hasImageS3Key: !!videoGenDto.imageS3Key,
          hasUuid: !!videoGenDto.uuid,
        });
        throw new BadRequestException(
          'Missing required fields: animation_prompt, imageS3Key, and uuid are required',
        );
      }

      this.logger.log('Running triage agent to determine model selection');
      const result = await run(triageAgent, [
        {
          role: 'user',
          content: `Generate a video with prompt: "${videoGenDto.animation_prompt}"\n art style: "${videoGenDto.art_style}"\n using image S3 key: "${videoGenDto.imageS3Key}"\n for user: "${videoGenDto.uuid}"`,
        },
      ]);

      this.logger.debug('Agent execution completed, parsing result');
      console.log(result.output);

      // Parse agent result using Gemini like segmentation service
      try {
        this.logger.log('Using Gemini to parse agent result');
        const geminiParseRes = await this.genAI.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: `Parse this entire agent conversation output and extract the video generation result. Return a JSON object with "s3Keys" (array of strings), "model" (string), and "totalVideos" (number).

          Full agent output:
          ${JSON.stringify(result.output, null, 2)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                s3Keys: {
                  type: 'array',
                  items: { type: 'string' },
                },
                model: { type: 'string' },
                totalVideos: { type: 'number' },
              },
              required: ['s3Keys', 'model', 'totalVideos'],
            },
          },
        } as any);

        const agentResult = JSON.parse(geminiParseRes.text);
        this.logger.debug('Parsed agent result:', agentResult);

        if (
          agentResult?.s3Keys &&
          agentResult?.model &&
          agentResult.s3Keys.length > 0
        ) {
          const totalTime = Date.now() - startTime;
          this.logger.log(
            `Video generation completed successfully in ${totalTime}ms`,
            {
              model: agentResult.model,
              totalVideos: agentResult.totalVideos,
              s3Keys: agentResult.s3Keys,
              uuid: videoGenDto.uuid,
            },
          );

          return {
            success: true,
            s3Keys: agentResult.s3Keys,
            model: agentResult.model,
            totalVideos: agentResult.totalVideos,
          };
        } else {
          this.logger.error(
            'Agent produced result but no videos were successfully uploaded',
            {
              agentResult,
              hasS3Keys: !!agentResult?.s3Keys,
              s3KeysLength: agentResult?.s3Keys?.length || 0,
              hasModel: !!agentResult?.model,
            },
          );
          throw new InternalServerErrorException(
            'Video generation completed but no videos were successfully uploaded to S3.',
          );
        }
      } catch (parseError) {
        this.logger.error(
          'Failed to parse agent result with Gemini:',
          parseError,
        );
      }

      throw new InternalServerErrorException(
        'Agent did not produce a valid video generation result.',
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Video generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid: videoGenDto.uuid,
        stack: error.stack,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        error.message?.includes('quota') ||
        error.message?.includes('limit')
      ) {
        throw new InternalServerErrorException(
          'API quota exceeded. Please try again later.',
        );
      }

      if (
        error.message?.includes('unauthorized') ||
        error.message?.includes('authentication')
      ) {
        throw new InternalServerErrorException(
          'API authentication failed. Please contact support.',
        );
      }

      throw new InternalServerErrorException(
        'Failed to generate video. Please try again later.',
      );
    }
  }

  /**
   * Generate video using Google's Veo2 model - optimized for cartoonish/animated content
   * @param animation_prompt - Animation prompt for video generation
   * @param imageS3Key - S3 key of the input image
   * @param uuid - User UUID for organizing uploads
   * @returns VideoGenerationResult with S3 keys of generated videos
   */
  async generateVeo2Video(
    animation_prompt: string,
    art_style: string,
    imageS3Key: string,
    uuid: string,
  ): Promise<VideoGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`Starting Veo2 video generation for user: ${uuid}`);

    try {
      // Fetch image from S3 and convert to base64
      this.logger.log(`Fetching image from S3: ${imageS3Key}`);
      const imageBase64 = await this.getImageFromS3AsBase64(imageS3Key);
      this.logger.log(
        `Successfully converted image to base64 (${imageBase64.length} chars)`,
      );

      // Start video generation with Google's Veo2
      this.logger.log('Starting Veo2 video generation with Google AI');
      let op = await this.genAI.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt: `ANIMATION_PROMPT: ${animation_prompt} \n ART_STYLE: ${art_style}`,
        image: {
          imageBytes: imageBase64,
          mimeType: 'image/png',
        },
        config: {
          aspectRatio: '16:9',
          numberOfVideos: 2,
        },
      });

      this.logger.log(`Veo2 operation started, polling for completion`);

      // Poll for completion
      let pollCount = 0;
      while (!op.done) {
        pollCount++;
        this.logger.debug(`Veo2 polling attempt ${pollCount}`);
        await new Promise((r) => setTimeout(r, 10000));
        op = await this.genAI.operations.getVideosOperation({ operation: op });
      }

      this.logger.log(
        `Veo2 video generation completed after ${pollCount} polls`,
      );

      const videos = op.response?.generatedVideos;
      this.logger.debug('Generated videos structure:', {
        hasVideos: !!videos,
        videoCount: videos?.length || 0,
        videosStructure: videos?.map((v, i) => ({
          index: i,
          hasVideo: !!v?.video,
          hasUri: !!v?.video?.uri,
          uri: v?.video?.uri || 'missing',
          keys: Object.keys(v || {}),
        })),
      });

      if (!videos || videos.length === 0) {
        this.logger.error('Veo2 generation failed - no videos returned');
        throw new Error('Veo2 video generation failed - no videos returned');
      }

      this.logger.log(
        `Veo2 generated ${videos.length} videos, starting S3 upload`,
      );

      // Upload videos to S3
      const s3Keys = [];
      for (let i = 0; i < videos.length; i++) {
        const uri = videos[i]?.video?.uri;
        this.logger.debug(`Processing video ${i + 1}/${videos.length}:`, {
          hasUri: !!uri,
          uri: uri || 'null',
          videoObject: videos[i] ? 'exists' : 'null',
        });

        if (uri) {
          try {
            this.logger.debug(
              `Uploading Veo2 video ${i + 1}/${videos.length} to S3`,
            );
            const s3Key = await this.uploadVideoToS3(uri, uuid);
            s3Keys.push(s3Key);
            this.logger.log(
              `Successfully uploaded Veo2 video ${i + 1} to S3: ${s3Key}`,
            );
          } catch (error) {
            this.logger.error(`Failed to upload Veo2 video ${i + 1}:`, {
              error: error.message,
              stack: error.stack,
              uri,
              uuid,
            });
          }
        } else {
          this.logger.warn(`Video ${i + 1} has no URI:`, videos[i]);
        }
      }

      if (s3Keys.length === 0) {
        this.logger.error('Failed to upload any Veo2 videos to S3');
        throw new Error('Failed to upload any Veo2 videos to S3');
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(
        `Veo2 video generation completed successfully in ${totalTime}ms`,
        {
          totalVideos: s3Keys.length,
          s3Keys,
          uuid,
        },
      );

      return {
        s3Keys,
        model: 'veo-2.0-generate-001',
        totalVideos: s3Keys.length,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Veo2 video generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Generate video using RunwayML's Gen-3 Alpha Turbo model - optimized for realistic/high-quality content
   * @param animation_prompt - Animation prompt for video generation
   * @param imageS3Key - S3 key of the input image
   * @param uuid - User UUID for organizing uploads
   * @returns VideoGenerationResult with S3 keys of generated videos
   */
  async generateRunwayMLVideo(
    animation_prompt: string,
    art_style: string,
    imageS3Key: string,
    uuid: string,
  ): Promise<VideoGenerationResult> {
    const startTime = Date.now();
    this.logger.log(`Starting RunwayML video generation for user: ${uuid}`);

    try {
      // Fetch image from S3 and convert to base64 data URI
      this.logger.log(`Fetching image from S3: ${imageS3Key}`);
      const imageBase64 = await this.getImageFromS3AsBase64(imageS3Key);
      
      // Create data URI for RunwayML
      const dataUri = `data:image/png;base64,${imageBase64}`;
      this.logger.log(`Successfully converted image to data URI`);

      // Combine animation prompt with art style
      const combinedPrompt = `${animation_prompt}. Art style: ${art_style}`;
      this.logger.log(`Combined prompt: ${combinedPrompt}`);

      // Start video generation with RunwayML
      this.logger.log('Starting RunwayML video generation');
      const task = await this.runwayClient.imageToVideo
        .create({
          model: 'gen3a_turbo',
          promptText: combinedPrompt,
          promptImage: dataUri,
          ratio: '1280:768',
          duration: 5,
        })
        .waitForTaskOutput({
          timeout: 10 * 60 * 1000, // 10 minutes timeout
        });

      this.logger.log('RunwayML video generation completed');
      this.logger.debug('RunwayML task result:', {
        taskId: task.id,
        status: task.status,
        hasOutput: !!task.output,
        outputLength: task.output?.length || 0,
      });

      if (!task.output || task.output.length === 0) {
        this.logger.error('RunwayML generation failed - no videos returned');
        throw new Error('RunwayML video generation failed - no videos returned');
      }

      this.logger.log(
        `RunwayML generated ${task.output.length} videos, starting S3 upload`,
      );

      // Upload videos to S3
      const s3Keys = [];
      for (let i = 0; i < task.output.length; i++) {
        const videoUrl = task.output[i];
        this.logger.debug(`Processing video ${i + 1}/${task.output.length}:`, {
          hasUrl: !!videoUrl,
          url: videoUrl || 'null',
        });

        if (videoUrl) {
          try {
            this.logger.debug(
              `Uploading RunwayML video ${i + 1}/${task.output.length} to S3`,
            );
            const s3Key = await this.uploadVideoToS3(videoUrl, uuid);
            s3Keys.push(s3Key);
            this.logger.log(
              `Successfully uploaded RunwayML video ${i + 1} to S3: ${s3Key}`,
            );
          } catch (error) {
            this.logger.error(`Failed to upload RunwayML video ${i + 1}:`, {
              error: error.message,
              stack: error.stack,
              url: videoUrl,
              uuid,
            });

            throw new error;
          }
        } else {
          this.logger.warn(`Video ${i + 1} has no URL:`, task.output[i]);
        }
      }

      if (s3Keys.length === 0) {
        this.logger.error('Failed to upload any RunwayML videos to S3');
        throw new Error('Failed to upload any RunwayML videos to S3');
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(
        `RunwayML video generation completed successfully in ${totalTime}ms`,
        {
          totalVideos: s3Keys.length,
          s3Keys,
          uuid,
        },
      );

      return {
        s3Keys,
        model: 'gen3a_turbo',
        totalVideos: s3Keys.length,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`RunwayML video generation failed after ${totalTime}ms`, {
        error: error.message,
        uuid,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Template for adding new video generation models (e.g., Kling, Runway, Sora)
   *
   * async generateKlingVideo(animation_prompt: string, imageS3Key: string, uuid: string): Promise<VideoGenerationResult> {
   *   const startTime = Date.now();
   *   this.logger.log(`Starting Kling video generation for user: ${uuid}`);
   *
   *   try {
   *     // 1. Fetch image from S3
   *     this.logger.log(`Fetching image from S3: ${imageS3Key}`);
   *     const imageBase64 = await this.getImageFromS3AsBase64(imageS3Key);
   *
   *     // 2. Call Kling API
   *     this.logger.log('Starting Kling video generation');
   *     const videos = await klingAPI.generateVideos({
   *       prompt: animation_prompt,
   *       image: imageBase64,
   *       // ... other Kling-specific params
   *     });
   *
   *     // 3. Upload videos to S3
   *     this.logger.log(`Kling generated ${videos.length} videos, starting S3 upload`);
   *     const s3Keys = [];
   *     for (const videoUri of videos) {
   *       const s3Key = await this.uploadVideoToS3(videoUri, uuid);
   *       s3Keys.push(s3Key);
   *       this.logger.log(`Successfully uploaded Kling video to S3: ${s3Key}`);
   *     }
   *
   *     // 4. Return result
   *     const totalTime = Date.now() - startTime;
   *     this.logger.log(`Kling video generation completed in ${totalTime}ms`, { totalVideos: s3Keys.length, uuid });
   *     return {
   *       s3Keys,
   *       model: 'kling-v1',
   *       totalVideos: s3Keys.length
   *     };
   *   } catch (error) {
   *     const totalTime = Date.now() - startTime;
   *     this.logger.error(`Kling video generation failed after ${totalTime}ms`, { error: error.message, uuid });
   *     throw error;
   *   }
   * }
   */

  private async getImageFromS3AsBase64(s3Key: string): Promise<string> {
    const startTime = Date.now();
    try {
      this.logger.debug(
        `Downloading image from S3 bucket: ${process.env.S3_BUCKET_NAME}, key: ${s3Key}`,
      );

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      const chunks = [];

      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString('base64');

      const downloadTime = Date.now() - startTime;
      this.logger.debug(
        `Successfully downloaded and converted image to base64 in ${downloadTime}ms (size: ${buffer.length} bytes)`,
      );

      return base64;
    } catch (error) {
      const downloadTime = Date.now() - startTime;
      this.logger.error(
        `Failed to fetch image from S3 after ${downloadTime}ms`,
        {
          s3Key,
          bucket: process.env.S3_BUCKET_NAME,
          error: error.message,
        },
      );
      throw new InternalServerErrorException('Failed to fetch image from S3');
    }
  }

  private async uploadVideoToS3(
    videoUri: string,
    uuid: string,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(`Starting video download from URI: ${videoUri}`);

    try {
      // Download video with authentication headers for Google AI URLs
      const headers: any = {};
      if (videoUri.includes('generativelanguage.googleapis.com')) {
        headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
        this.logger.debug('Added Google AI API key header for video download');
      }

      const videoResponse = await axios.get(videoUri, {
        responseType: 'arraybuffer',
        headers,
      });
      const videoBuffer = Buffer.from(videoResponse.data);

      const downloadTime = Date.now() - startTime;
      this.logger.debug(
        `Video downloaded in ${downloadTime}ms (size: ${videoBuffer.length} bytes)`,
      );

      // Generate S3 key
      const s3Key = `${uuid}/videos/${randomUUID()}.mp4`;
      this.logger.debug(`Uploading video to S3 with key: ${s3Key}`);

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: videoBuffer,
        ContentType: 'video/mp4',
      });

      await this.s3Client.send(command);

      const totalTime = Date.now() - startTime;
      this.logger.debug(`Video uploaded to S3 successfully in ${totalTime}ms`);

      return s3Key;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(`Failed to upload video to S3 after ${totalTime}ms`, {
        videoUri,
        uuid,
        error: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      });
      throw error;
    }
  }
}
