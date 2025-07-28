import { Module } from '@nestjs/common';
import { GetWebInfoController } from './get-web-info.controller';
import { GetWebInfoService } from './get-web-info.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ProjectHelperModule, CreditsModule],
  controllers: [GetWebInfoController],
  providers: [GetWebInfoService],
})
export class GetWebInfoModule {}
