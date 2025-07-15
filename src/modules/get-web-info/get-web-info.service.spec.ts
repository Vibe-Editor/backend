import { Test, TestingModule } from '@nestjs/testing';
import { GetWebInfoService } from './get-web-info.service';

describe('GetWebInfoService', () => {
  let service: GetWebInfoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GetWebInfoService],
    }).compile();

    service = module.get<GetWebInfoService>(GetWebInfoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
