import { Test, TestingModule } from '@nestjs/testing';
import { AgentServiceV2 } from './agentv2.service';

describe('AgentServiceV2', () => {
  let service: AgentServiceV2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentServiceV2],
    }).compile();

    service = module.get<AgentServiceV2>(AgentServiceV2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
