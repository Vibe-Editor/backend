import { Test, TestingModule } from '@nestjs/testing';
import { ImageGenController } from './image-gen.controller';

describe('ImageGenController', () => {
  let controller: ImageGenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageGenController],
    }).compile();

    controller = module.get<ImageGenController>(ImageGenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
