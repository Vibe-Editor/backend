import { PartialType } from '@nestjs/mapped-types';
import { CreateVoiceGenDto } from './create-voice-gen.dto';

export class UpdateVoiceGenDto extends PartialType(CreateVoiceGenDto) {}
