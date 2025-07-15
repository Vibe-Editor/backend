import { Test, TestingModule } from '@nestjs/testing';
import { ConceptWriterController } from './concept-writer.controller';

describe('ConceptWriterController', () => {
  let controller: ConceptWriterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConceptWriterController],
    }).compile();

    controller = module.get<ConceptWriterController>(ConceptWriterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
