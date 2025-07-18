import { Module } from '@nestjs/common';
import { ProjectHelperService } from './project-helper.service';

@Module({
  providers: [ProjectHelperService],
  exports: [ProjectHelperService],
})
export class ProjectHelperModule {}
