import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const logger = new Logger('S3 Service');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function getImageFromS3AsBase64(s3Key: string): Promise<string> {
  const startTime = Date.now();
  try {
    logger.debug(
      `Downloading image from S3 bucket: ${process.env.S3_BUCKET_NAME}, key: ${s3Key}`,
    );

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    const chunks = [];

    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');

    const downloadTime = Date.now() - startTime;
    logger.debug(
      `Successfully downloaded and converted image to base64 in ${downloadTime}ms (size: ${buffer.length} bytes)`,
    );

    return base64;
  } catch (error) {
    const downloadTime = Date.now() - startTime;
    logger.error(`Failed to fetch image from S3 after ${downloadTime}ms`, {
      s3Key,
      bucket: process.env.S3_BUCKET_NAME,
      error: error.message,
    });
    throw new InternalServerErrorException('Failed to fetch image from S3');
  }
}

export async function uploadVideoToS3(
  videoUri: string,
  segmentId: string,
  projectId: string,
): Promise<string> {
  const startTime = Date.now();
  logger.debug(`Starting video download from URI: ${videoUri}`);

  try {
    // Download video with authentication headers for Google AI URLs
    const headers: any = {};
    if (videoUri.includes('generativelanguage.googleapis.com')) {
      headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
      logger.debug('Added Google AI API key header for video download');
    }

    const videoResponse = await axios.get(videoUri, {
      responseType: 'arraybuffer',
      headers,
    });
    const videoBuffer = Buffer.from(videoResponse.data);

    const downloadTime = Date.now() - startTime;
    logger.debug(
      `Video downloaded in ${downloadTime}ms (size: ${videoBuffer.length} bytes)`,
    );

    // Generate S3 key
    const s3Key = `${projectId}/videos/${segmentId}/${randomUUID()}.mp4`;
    logger.debug(`Uploading video to S3 with key: ${s3Key}`);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: videoBuffer,
      ContentType: 'video/mp4',
    });

    await s3Client.send(command);

    const totalTime = Date.now() - startTime;
    logger.debug(`Video uploaded to S3 successfully in ${totalTime}ms`);

    return s3Key;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Failed to upload video to S3 after ${totalTime}ms`, {
      videoUri,
      segmentId,
      error: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
    });
    throw error;
  }
}

export async function uploadAudioToS3(
  audioBuffer: Buffer,
  segmentId: string,
  projectId: string,
): Promise<string> {
  const startTime = Date.now();
  logger.debug(`Starting audio upload to S3`);

  try {
    const s3Key = `${projectId}/audio/${segmentId}/${randomUUID()}.mp3`;
    logger.debug(`Uploading audio to S3 with key: ${s3Key}`);

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
    });

    await s3Client.send(command);

    const totalTime = Date.now() - startTime;
    logger.debug(`Audio uploaded to S3 successfully in ${totalTime}ms`);

    return s3Key;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Failed to upload audio to S3 after ${totalTime}ms`, {
      segmentId,
      projectId,
      error: error.message,
    });
    throw error;
  }
}
