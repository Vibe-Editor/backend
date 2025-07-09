/**
 * Application Entry Point
 * Bootstrap and configure your NestJS application here
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import 'dotenv/config';
import { setDefaultOpenAIKey } from '@openai/agents';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(8080);
}
bootstrap();
