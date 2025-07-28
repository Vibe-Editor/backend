import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

const bucketName = process.env.S3_BUCKET_NAME;

const logger = new Logger('Recraft Agent');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const googleGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function imagenImageGen(
  uuid: string,
  visual_prompt: string,
  art_style: string,
) {
  const prompt = `${visual_prompt}. Art style: ${art_style}`;

  const response = await googleGenAI.models.generateImages({
    model: 'imagen-4.0-generate-preview-06-06',
    prompt,
    config: { numberOfImages: 1 },
  });

  if (response.generatedImages[0].image) {
    const generatedImage = response.generatedImages[0].image;
    const imageBuffer = Buffer.from(generatedImage.imageBytes, 'base64');
    const s3Key = `${uuid}/images/${randomUUID()}.png`;
    logger.log(`Uploading Imagen image to S3 with key: ${s3Key}`);

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
      model: 'imagen',
      image_size_bytes: imageBuffer.length,
    };
  }
}
