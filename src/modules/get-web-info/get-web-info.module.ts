import { Module } from '@nestjs/common';
import { GetWebInfoController } from './get-web-info.controller';
import { GetWebInfoService } from './get-web-info.service';

@Module({
  controllers: [GetWebInfoController],
  providers: [GetWebInfoService]
})
export class GetWebInfoModule {}
