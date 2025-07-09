import { Injectable } from '@nestjs/common';
import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';
import { VoiceoverDto } from './dto/voiceover.dto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

@Injectable()
export class VoiceoverService {
  private readonly elevenLabs: ElevenLabsClient;
  private readonly s3: S3Client;
  private readonly bucketName = process.env.S3_BUCKET_NAME;

  constructor() {
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async generateVoiceover(voiceoverDto: VoiceoverDto) {
    async function streamToBuffer(
      stream: ReadableStream<Uint8Array>,
    ): Promise<Buffer> {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      return Buffer.concat(chunks);
    }

    const stream = await this.elevenLabs.textToSpeech.convert(
      'JBFqnCBsd6RMkjVDRZzb',
      {
        text: voiceoverDto.narration_prompt,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      },
    );

    const audioBuffer = await streamToBuffer(stream);

    const s3Key = `voiceovers/${randomUUID()}.mp3`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: audioBuffer,
      ContentLength: audioBuffer.length,
      ContentType: 'audio/mpeg',
    });

    await this.s3.send(command);

    return {
      s3_key: s3Key,
    };
  }
}
