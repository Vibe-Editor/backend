import { Controller, Post, Body } from '@nestjs/common';
import { GetWebInfoService } from './get-web-info.service';
import { GetWebInfoDto } from './dto/get-web-info.dto';

@Controller('get-web-info')
export class GetWebInfoController {
    constructor(private readonly getWebInfoService: GetWebInfoService) {}

    @Post()
    async getWebInfo(@Body() getWebInfoDto: GetWebInfoDto) {
        return this.getWebInfoService.getWebInfo(getWebInfoDto);
    }
}
