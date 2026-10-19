import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validationExceptionFactory } from '../../src/common/validation';
import { EventRegistration } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { EventFiltersDto } from '../../src/events/event-filters.dto';
import { EventsService } from '../../src/events/events.service';
import { Interest } from '../../src/interests/interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

function fixture() {
  const event = Object.assign(new Event(), {
    id: 'event-1', title: 'Promenade', interestId: 1, organizerId: 'organizer-1',
    startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000),
    cityName: 'Lyon', departmentCode: '69', postalCode: '69001', cityCode: '69123',
    exactAddress: '12 rue secrète', capacity: 5, status: EventStatus.Published,
  });
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const eventQuery: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere']) {
    eventQuery[method] = jest.fn((sql: string, values?: Record<string, unknown>) => {
      clauses.push(sql);
      Object.assign(params, values);
      return eventQuery;
    });
  }
  for (const method of ['orderBy', 'addOrderBy', 'skip', 'take']) {
    eventQuery[method] = jest.fn(() => eventQuery);
  }
  eventQuery.getManyAndCount = jest.fn(async () => [[event], 1]);
  const countQuery: Record<string, jest.Mock> = {};
  for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) {
    countQuery[method] = jest.fn(() => countQuery);
  }
  countQuery.getRawMany = jest.fn(async () => [{ eventId: event.id, registeredCount: '2' }]);
  const actor = Object.assign(new User(), { id: 'viewer', role: UserRole.Member, status: AccountStatus.Active });
  const actorProfile = Object.assign(new Profile(), { userId: 'viewer', status: ProfileStatus.Approved });
  const organizer = Object.assign(new User(), { id: 'organizer-1', role: UserRole.Organizer, status: AccountStatus.Active });
  const organizerProfile = Object.assign(new Profile(), { userId: 'organizer-1', displayName: 'Alex', status: ProfileStatus.Approved });
  const interest = Object.assign(new Interest(), { id: 1, slug: 'marche', label: 'Marche' });
  const manager = {
    findOneBy: jest.fn(async (entity: unknown) => entity === User ? actor : entity === Profile ? actorProfile : null),
    createQueryBuilder: jest.fn((entity: unknown) => entity === Event ? eventQuery : countQuery),
    findBy: jest.fn(async (entity: unknown) => entity === Interest ? [interest] : entity === User ? [organizer] :
      entity === Profile ? [organizerProfile] : entity === EventRegistration ? [] : []),
  };
  const service = new EventsService({ manager } as unknown as DataSource);
  return { service, eventQuery, clauses, params };
}

describe('Issue #13 — filtres des événements publiés', () => {
  it('valide les filtres et la pagination', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
      exceptionFactory: validationExceptionFactory });
    const metadata: ArgumentMetadata = { type: 'query', metatype: EventFiltersDto };
    await expect(pipe.transform({ interestId: '1', cityName: ' Lyon ', page: '2' }, metadata))
      .resolves.toMatchObject({ interestId: 1, cityName: 'Lyon', page: 2 });
    for (const invalid of [{ page: '0' }, { interestId: 'x' }, { status: 'draft' }]) {
      await expect(pipe.transform(invalid, metadata)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('combine centre d’intérêt et ville, limite aux sorties publiées à venir et pagine', async () => {
    const f = fixture();
    const result = await f.service.listPublished('viewer', { interestId: 1, cityName: 'Lyon', page: 2 });
    const sql = f.clauses.join(' | ');
    expect(sql).toContain('event.status = :status');
    expect(sql).toContain('event.starts_at > :from');
    expect(sql).toContain('event.interest_id = :interestId');
    expect(sql).toContain('LOWER(event.city_name) = LOWER(:cityName)');
    expect(f.params).toMatchObject({ status: EventStatus.Published, interestId: 1, cityName: 'Lyon' });
    expect(f.eventQuery.skip).toHaveBeenCalledWith(12);
    expect(f.eventQuery.take).toHaveBeenCalledWith(12);
    expect(result).toMatchObject({ page: 2, pageSize: 12, total: 1 });
  });

  it('ne renvoie ni adresse exacte ni code postal dans la liste', async () => {
    const result = await fixture().service.listPublished('viewer', {});
    expect(result.items[0]).toMatchObject({
      location: { cityName: 'Lyon', departmentCode: '69' },
      availablePlaces: 3,
    });
    const serialized = JSON.stringify(result);
    for (const secret of ['12 rue secrète', '69001', '69123', 'exactAddress', 'postalCode', 'cityCode']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
