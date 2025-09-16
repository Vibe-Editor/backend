import { Module } from '@nestjs/common';
import { ContextController } from './context.controller';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { CreditsModule } from '../credits/credits.module';
import { ContextService } from './context.service';

@Module({
  imports: [ProjectHelperModule, CreditsModule],
  controllers: [ContextController],
  providers: [ContextService],
})
export class ContextModule {}
