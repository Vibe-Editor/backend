import { Test, TestingModule } from '@nestjs/testing';
import { SegmentationController } from './segmentation.controller';

describe('SegmentationController', () => {
  let controller: SegmentationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SegmentationController],
    }).compile();

    controller = module.get<SegmentationController>(SegmentationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
