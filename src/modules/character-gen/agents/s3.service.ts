import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const logger = new Logger('Character S3 Service');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function uploadCharacterImageToS3(
  imageBuffer: Buffer,
  uuid: string,
  fileName: string,
): Promise<string> {
  const startTime = Date.now();
  logger.debug(`Uploading character image to S3: ${fileName}`);

  try {
    // Generate S3 key
    const s3Key = `${uuid}/character-images/${randomUUID()}-${fileName}`;
    logger.debug(`Uploading image to S3 with key: ${s3Key}`);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
    });

    await s3Client.send(command);

    const totalTime = Date.now() - startTime;
    logger.debug(`Image uploaded to S3 successfully in ${totalTime}ms`);

    return s3Key;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Failed to upload image to S3 after ${totalTime}ms`, {
      fileName,
      uuid,
      error: error.message,
    });
    throw new InternalServerErrorException('Failed to upload image to S3');
  }
}

export async function uploadSpriteSheetToS3(
  imageBuffer: Buffer,
  uuid: string,
): Promise<string> {
  const startTime = Date.now();
  logger.debug(`Uploading sprite sheet to S3`);

  try {
    // Generate S3 key
    const s3Key = `${uuid}/sprite-sheets/${randomUUID()}.png`;
    logger.debug(`Uploading sprite sheet to S3 with key: ${s3Key}`);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
    });

    await s3Client.send(command);

    const totalTime = Date.now() - startTime;
    logger.debug(`Sprite sheet uploaded to S3 successfully in ${totalTime}ms`);

    return s3Key;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(`Failed to upload sprite sheet to S3 after ${totalTime}ms`, {
      uuid,
      error: error.message,
    });
    throw new InternalServerErrorException(
      'Failed to upload sprite sheet to S3',
    );
  }
}

export async function uploadFinalCharacterToS3(
  imageBuffer: Buffer,
  uuid: string,
): Promise<string> {
  const startTime = Date.now();
  logger.debug(`Uploading final character to S3`);

  try {
    // Generate S3 key
    const s3Key = `${uuid}/final-characters/${randomUUID()}.png`;
    logger.debug(`Uploading final character to S3 with key: ${s3Key}`);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
    });

    await s3Client.send(command);

    const totalTime = Date.now() - startTime;
    logger.debug(
      `Final character uploaded to S3 successfully in ${totalTime}ms`,
    );

    return s3Key;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error(
      `Failed to upload final character to S3 after ${totalTime}ms`,
      {
        uuid,
        error: error.message,
      },
    );
    throw new InternalServerErrorException(
      'Failed to upload final character to S3',
    );
  }
}

export function getS3ImageUrl(s3Key: string): string {
  // Use CloudFront URL for better performance and caching
  const cloudfrontUrl = `https://ds0fghatf06yb.cloudfront.net/${s3Key}`;
  
  return cloudfrontUrl;
}

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
