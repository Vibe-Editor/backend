/**
 * Root Module
 * Configure app-wide providers and imports here
 */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SegmentationModule } from './modules/segmentation/segmentation.module';
import { ImageGenModule } from './modules/image-gen/image-gen.module';
import { VideoGenModule } from './modules/video-gen/video-gen.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [SegmentationModule, ImageGenModule, VideoGenModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
