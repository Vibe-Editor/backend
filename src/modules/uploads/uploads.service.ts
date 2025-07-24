import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadsService {
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
  private readonly bucket = process.env.S3_BUCKET_NAME || '';
  private readonly cdnDomain = process.env.CDN_DOMAIN || '';

  async getPresignedUrls(uuid: string, count = 6) {
    const keys: string[] = [];
    const putUrls: string[] = [];
    const getUrls: string[] = [];

    for (let i = 0; i < count; i++) {
      const key = `${uuid}/character-images/${randomUUID()}.png`;
      const putCmd = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'image/png',
      });
      const putUrl = await getSignedUrl(this.s3, putCmd, { expiresIn: 900 });

      keys.push(key);
      putUrls.push(putUrl);
      getUrls.push(`https://${this.cdnDomain}/${key}`);
    }

    return { keys, putUrls, urls: getUrls };
  }
} 