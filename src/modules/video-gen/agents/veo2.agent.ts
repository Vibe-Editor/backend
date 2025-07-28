import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import { VideoGenerationResult } from '../video-gen.service';
import { GoogleGenAI } from '@google/genai';
import { getImageFromS3AsBase64, uploadVideoToS3 } from '../s3/s3.service';
import 'dotenv/config';
import { Logger } from '@nestjs/common';

const googleGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const logger = new Logger('Veo2 Agent');

export const createVeo2Agent = () =>
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
        execute: async ({ animation_prompt, art_style, imageS3Key, uuid }) => {
          return await generateVeo2Video(
            animation_prompt,
            art_style,
            imageS3Key,
            uuid,
          );
        },
      }),
    ],
  });

async function generateVeo2Video(
  animation_prompt: string,
  art_style: string,
  imageS3Key: string,
  uuid: string,
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  logger.log(`Starting Veo2 video generation for user: ${uuid}`);

  // Trim animation_prompt to ensure total prompt length stays reasonable (under 2000 characters for Veo2)
  const additionalText = ` \n ART_STYLE: ${art_style}`;
  const maxAnimationPromptLength =
    2000 - additionalText.length - 'ANIMATION_PROMPT: '.length;

  if (animation_prompt.length > maxAnimationPromptLength) {
    logger.warn(
      `animation_prompt exceeded ${maxAnimationPromptLength} characters (${animation_prompt.length}), trimming to ${maxAnimationPromptLength} characters.`,
    );
    animation_prompt = animation_prompt
      .substring(0, maxAnimationPromptLength)
      .trim();
  }

  try {
    // Fetch image from S3 and convert to base64
    logger.log(`Fetching image from S3: ${imageS3Key}`);
    const imageBase64 = await getImageFromS3AsBase64(imageS3Key);
    logger.log(
      `Successfully converted image to base64 (${imageBase64.length} chars)`,
    );

    // Start video generation with Google's Veo2
    logger.log('Starting Veo2 video generation with Google AI');
    let op = await googleGenAI.models.generateVideos({
      model: 'veo-2.0-generate-001',
      prompt: `ANIMATION_PROMPT: ${animation_prompt} \n ART_STYLE: ${art_style}`,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/png',
      },
      config: {
        aspectRatio: '16:9',
        numberOfVideos: 1,
      },
    });

    logger.log(`Veo2 operation started, polling for completion`);

    // Poll for completion
    let pollCount = 0;
    while (!op.done) {
      pollCount++;
      logger.debug(`Veo2 polling attempt ${pollCount}`);
      await new Promise((r) => setTimeout(r, 10000));
      op = await googleGenAI.operations.getVideosOperation({ operation: op });
    }

    logger.log(`Veo2 video generation completed after ${pollCount} polls`);

    const videos = op.response?.generatedVideos;
    logger.debug('Generated videos structure:', {
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
      logger.error('Veo2 generation failed - no videos returned');
      throw new Error('Veo2 video generation failed - no videos returned');
    }

    logger.log(`Veo2 generated ${videos.length} videos, starting S3 upload`);

    // Upload videos to S3
    const s3Keys = [];
    for (let i = 0; i < videos.length; i++) {
      const uri = videos[i]?.video?.uri;
      logger.debug(`Processing video ${i + 1}/${videos.length}:`, {
        hasUri: !!uri,
        uri: uri || 'null',
        videoObject: videos[i] ? 'exists' : 'null',
      });

      if (uri) {
        try {
          logger.debug(`Uploading Veo2 video ${i + 1}/${videos.length} to S3`);
          const s3Key = await uploadVideoToS3(uri, uuid);
          s3Keys.push(s3Key);
          logger.log(
            `Successfully uploaded Veo2 video ${i + 1} to S3: ${s3Key}`,
          );
        } catch (error) {
          logger.error(`Failed to upload Veo2 video ${i + 1}:`, {
            error: error.message,
            stack: error.stack,
            uri,
            uuid,
          });
        }
      } else {
        logger.warn(`Video ${i + 1} has no URI:`, videos[i]);
      }
    }

    if (s3Keys.length === 0) {
      logger.error('Failed to upload any Veo2 videos to S3');
      throw new Error('Failed to upload any Veo2 videos to S3');
    }

    const totalTime = Date.now() - startTime;
    logger.log(
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
    logger.error(`Veo2 video generation failed after ${totalTime}ms`, {
      error: error.message,
      uuid,
      stack: error.stack,
    });
    throw error;
  }
}
