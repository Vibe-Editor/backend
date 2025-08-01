/**
 * Application Entry Point
 * Bootstrap and configure your NestJS application here
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import 'dotenv/config';
import { setDefaultOpenAIKey } from '@openai/agents';

async function bootstrap() {
  // Configure secure logging
  const logger = new Logger('Bootstrap');

  // Override console methods to prevent sensitive data logging
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalConsoleDebug = console.debug;
  const originalConsoleWarn = console.warn;

  // Simple sanitization for console methods
  const sanitizeMessage = (message: any): any => {
    if (typeof message === 'string') {
      return message
        .replace(/sk-[a-zA-Z0-9-]+/g, '[REDACTED]')
        .replace(/Bearer\s+[a-zA-Z0-9-._~+/]+=*/g, 'Bearer [REDACTED]');
    }
    return message;
  };

  console.error = (...args) => {
    const sanitizedArgs = args.map(sanitizeMessage);
    originalConsoleError.apply(console, sanitizedArgs);
  };

  console.log = (...args) => {
    const sanitizedArgs = args.map(sanitizeMessage);
    originalConsoleLog.apply(console, sanitizedArgs);
  };

  console.debug = (...args) => {
    const sanitizedArgs = args.map(sanitizeMessage);
    originalConsoleDebug.apply(console, sanitizedArgs);
  };

  console.warn = (...args) => {
    const sanitizedArgs = args.map(sanitizeMessage);
    originalConsoleWarn.apply(console, sanitizedArgs);
  };

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'], // Disable debug logging in production
  });

  // Make OpenAI key available globally for agents
  setDefaultOpenAIKey(process.env.OPENAI_API_KEY);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());

  logger.log('Application starting with secure logging enabled');
  await app.listen(8080);
  logger.log('Application started successfully on port 8080');
}
bootstrap();
