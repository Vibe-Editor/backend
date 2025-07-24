import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  providers: [UploadsService, JwtAuthGuard],
  controllers: [UploadsController],
})
export class UploadsModule {} 