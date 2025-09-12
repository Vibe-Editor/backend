import { Test, TestingModule } from '@nestjs/testing';
import { AgentControllerV2 } from './agentv2.controller';

describe('AgentController', () => {
  let controller: AgentControllerV2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentControllerV2],
    }).compile();

    controller = module.get<AgentControllerV2>(AgentControllerV2);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
