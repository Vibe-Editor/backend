import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

interface PresignDto {
  uuid: string;
  count?: number;
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('presign')
  async presign(
    @Body() { uuid, count }: PresignDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser('id') _userId: string,
  ) {
    return this.service.getPresignedUrls(uuid, count ?? 6);
  }
}
