import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Interest } from './interest.entity';
import { InterestsService } from './interests.service';

describe('InterestsService', () => {
  const find = jest.fn();
  let service: InterestsService;

  beforeEach(async () => {
    find.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [InterestsService, { provide: getRepositoryToken(Interest), useValue: { find } }],
    }).compile();
    service = moduleRef.get(InterestsService);
  });

  it('renvoie les centres d\'intérêt triés par libellé', async () => {
    find.mockResolvedValue([
      Object.assign(new Interest(), { id: 2, slug: 'cuisine', label: 'Cuisine' }),
    ]);

    await expect(service.findAll()).resolves.toEqual([{ id: 2, slug: 'cuisine', label: 'Cuisine' }]);
    expect(find).toHaveBeenCalledWith({ order: { label: 'ASC' } });
  });
});
