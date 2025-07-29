import axios from 'axios';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';

const bucketName = process.env.S3_BUCKET_NAME;

const logger = new Logger('Recraft Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function recraftImageGen(
  uuid: string,
  visual_prompt: string,
  art_style: string,
) {
  let recraftPrompt = `${visual_prompt}. Art style: ${art_style}. Create a realistic, photographic image with no text elements.`;

  if (recraftPrompt.length > 950) {
    logger.error(
      `Final prompt still exceeds 950 characters (${recraftPrompt.length}). Applying emergency trim.`,
    );
    recraftPrompt = recraftPrompt.substring(0, 950).trim();
    logger.warn(
      `Emergency trimmed prompt to ${recraftPrompt.length} characters`,
    );
  }

  const response = await axios.post(
    'https://external.api.recraft.ai/v1/images/generations',
    {
      prompt: recraftPrompt,
      style: 'realistic_image',
      size: '1024x1024',
      n: 1,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.RECRAFT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (response.data) {
    const s3Key = `${uuid}/images/${randomUUID()}.png`;
    logger.log(`Uploading Recraft image to S3 with key: ${s3Key}`);

    const imageData = response.data.data[0];
    const imageUrl = imageData.url;

    if (!imageUrl) {
      logger.error('Recraft generation failed - no image URL returned');
      throw new Error(
        'Recraft image generation failed - no image URL returned',
      );
    }

    logger.log(`Recraft image URL: ${imageUrl}`);

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: imageBuffer,
      ContentLength: imageBuffer.length,
      ContentType: 'image/png',
    });

    await s3.send(command);

    return {
      s3_key: s3Key,
      model: 'recraft-v3',
      image_size_bytes: imageBuffer.length,
    };
  }
}
