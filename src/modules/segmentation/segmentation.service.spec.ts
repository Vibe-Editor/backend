import { Test, TestingModule } from '@nestjs/testing';
import { SegmentationService } from './segmentation.service';

describe('SegmentationService', () => {
  let service: SegmentationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SegmentationService],
    }).compile();

    service = module.get<SegmentationService>(SegmentationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
