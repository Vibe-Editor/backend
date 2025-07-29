import { Module } from '@nestjs/common';
import { CharacterGenService } from './character-gen.service';
import { CharacterGenController } from './character-gen.controller';
import { ProjectHelperModule } from '../../common/services/project-helper.module';
import { CreditService } from '../credits/credit.service';

@Module({
  imports: [ProjectHelperModule],
  controllers: [CharacterGenController],
  providers: [CharacterGenService, CreditService],
})
export class CharacterGenModule {}
