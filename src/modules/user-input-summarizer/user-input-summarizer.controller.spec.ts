import { Test, TestingModule } from '@nestjs/testing';
import { UserInputSummarizerController } from './user-input-summarizer.controller';

describe('UserInputSummarizerController', () => {
  let controller: UserInputSummarizerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserInputSummarizerController],
    }).compile();

    controller = module.get<UserInputSummarizerController>(
      UserInputSummarizerController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
