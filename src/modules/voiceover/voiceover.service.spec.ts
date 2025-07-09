import { Test, TestingModule } from '@nestjs/testing';
import { VoiceoverService } from './voiceover.service';

describe('VoiceoverService', () => {
  let service: VoiceoverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceoverService],
    }).compile();

    service = module.get<VoiceoverService>(VoiceoverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
