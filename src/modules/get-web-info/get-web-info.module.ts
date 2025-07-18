import { Module } from '@nestjs/common';
import { GetWebInfoController } from './get-web-info.controller';
import { GetWebInfoService } from './get-web-info.service';
import { ProjectHelperModule } from '../../common/services/project-helper.module';

@Module({
  imports: [ProjectHelperModule],
  controllers: [GetWebInfoController],
  providers: [GetWebInfoService],
})
export class GetWebInfoModule {}
