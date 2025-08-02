import { Module } from '@nestjs/common';
import { CharacterGenController } from './character-gen.controller';
import { CharacterGenService } from './character-gen.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { VideoGenModule } from '../video-gen/video-gen.module';

@Module({
  imports: [VideoGenModule, ProjectHelperModule],
  controllers: [CharacterGenController],
  providers: [CharacterGenService],
  exports: [CharacterGenService],
})
export class CharacterGenModule {}
