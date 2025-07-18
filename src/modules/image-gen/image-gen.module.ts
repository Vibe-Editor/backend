import { Module } from '@nestjs/common';
import { ImageGenController } from './image-gen.controller';
import { ImageGenService } from './image-gen.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [ImageGenController],
  providers: [ImageGenService],
})
export class ImageGenModule {}
