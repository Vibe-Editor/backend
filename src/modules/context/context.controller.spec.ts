import { Test, TestingModule } from '@nestjs/testing';
import { ContextController } from './context.controller';

describe('ContextController', () => {
  let controller: ContextController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextController],
    }).compile();

    controller = module.get<ContextController>(
      ContextController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
