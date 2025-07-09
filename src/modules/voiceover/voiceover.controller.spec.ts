import { Test, TestingModule } from '@nestjs/testing';
import { VoiceoverController } from './voiceover.controller';

describe('VoiceoverController', () => {
  let controller: VoiceoverController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceoverController],
    }).compile();

    controller = module.get<VoiceoverController>(VoiceoverController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
