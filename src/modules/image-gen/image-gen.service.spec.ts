import { Test, TestingModule } from '@nestjs/testing';
import { ImageGenService } from './image-gen.service';

describe('ImageGenService', () => {
  let service: ImageGenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImageGenService],
    }).compile();

    service = module.get<ImageGenService>(ImageGenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
