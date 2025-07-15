import { Test, TestingModule } from '@nestjs/testing';
import { ConceptWriterService } from './concept-writer.service';

describe('ConceptWriterService', () => {
  let service: ConceptWriterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConceptWriterService],
    }).compile();

    service = module.get<ConceptWriterService>(ConceptWriterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
