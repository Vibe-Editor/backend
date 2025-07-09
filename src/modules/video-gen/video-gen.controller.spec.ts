import { Test, TestingModule } from '@nestjs/testing';
import { VideoGenController } from './video-gen.controller';

describe('VideoGenController', () => {
  let controller: VideoGenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoGenController],
    }).compile();

    controller = module.get<VideoGenController>(VideoGenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
