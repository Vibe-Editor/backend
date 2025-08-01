import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { GetWebInfoService } from './get-web-info.service';
import { GetWebInfoDto } from './dto/get-web-info.dto';
import { UpdateWebInfoDto } from './dto/update-web-info.dto';
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

  @Get()
  async getStoredWebInfo(
    @CurrentUser('id') userId: string,
    @Query('id') webInfoId?: string,
    @Query('projectId') projectId?: string,
  ) {
    if (webInfoId) {
      return this.getWebInfoService.getWebInfoById(webInfoId, userId);
    }
    return this.getWebInfoService.getAllWebInfo(userId, projectId);
  }

  @Patch(':id')
  async updateWebInfoPrompt(
    @Param('id') webInfoId: string,
    @Body() updateWebInfoDto: UpdateWebInfoDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.getWebInfoService.updateWebInfoPrompt(
      webInfoId,
      updateWebInfoDto,
      userId,
    );
  }
}
