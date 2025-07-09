import { Test, TestingModule } from '@nestjs/testing';
import { VideoGenService } from './video-gen.service';

describe('VideoGenService', () => {
  let service: VideoGenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VideoGenService],
    }).compile();

    service = module.get<VideoGenService>(VideoGenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
