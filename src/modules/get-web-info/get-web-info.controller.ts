import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GetWebInfoService } from './get-web-info.service';
import { GetWebInfoDto } from './dto/get-web-info.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('get-web-info')
@UseGuards(JwtAuthGuard)
export class GetWebInfoController {
  constructor(private readonly getWebInfoService: GetWebInfoService) {}

  @Post()
  async getWebInfo(
    @Body() getWebInfoDto: GetWebInfoDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.getWebInfoService.getWebInfo(getWebInfoDto, userId);
  }
}
