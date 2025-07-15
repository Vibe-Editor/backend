import { Test, TestingModule } from '@nestjs/testing';
import { GetWebInfoController } from './get-web-info.controller';

describe('GetWebInfoController', () => {
  let controller: GetWebInfoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GetWebInfoController],
    }).compile();

    controller = module.get<GetWebInfoController>(GetWebInfoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
