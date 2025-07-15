import { Test, TestingModule } from '@nestjs/testing';
import { UserInputSummarizerService } from './user-input-summarizer.service';

describe('UserInputSummarizerService', () => {
  let service: UserInputSummarizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserInputSummarizerService],
    }).compile();

    service = module.get<UserInputSummarizerService>(UserInputSummarizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
