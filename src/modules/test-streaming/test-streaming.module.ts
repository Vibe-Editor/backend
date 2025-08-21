import { Module } from '@nestjs/common';
import { TestStreamingController } from './test-streaming.controller';

@Module({
  controllers: [TestStreamingController],
})
export class TestStreamingModule {}