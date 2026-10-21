import { RequestMethod } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../../src/auth/auth.decorators';
import { EventRegistration, RegistrationStatus } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { EventsService } from '../../src/events/events.service';
import { MeEventsController } from '../../src/events/me-events.controller';
import { Interest } from '../../src/interests/interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

const DAY = 86_400_000;

function event(id: string, status: EventStatus, startsIn: number): Event {
  return Object.assign(new Event(), {
    id, organizerId: 'owner', interestId: 1, status,
    title: `Sortie ${id}`, description: 'Une sortie de quartier',
    startsAt: new Date(Date.now() + startsIn), endsAt: new Date(Date.now() + startsIn + 7_200_000),
    cityName: 'Lyon', departmentCode: '69', postalCode: '69001', cityCode: '69381',
    locationVerified: true, areaHint: null, exactAddress: '12 rue des Lilas',
    capacity: 5, cancellationReason: null,
  });
}

function chain(result: Record<string, jest.Mock>): Record<string, jest.Mock> {
  const query: Record<string, jest.Mock> = {};
  for (const method of ['select', 'addSelect', 'innerJoin', 'where', 'andWhere', 'groupBy', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    query[method] = jest.fn(() => query);
  }
  return Object.assign(query, result);
}

function fixture(events: Event[]) {
  const owner = Object.assign(new User(), { id: 'owner', role: UserRole.Organizer, status: AccountStatus.Active });
  const ownerProfile = Object.assign(new Profile(), { userId: 'owner', displayName: 'Camille', status: ProfileStatus.Approved });
  const member = Object.assign(new User(), { id: 'member-1', role: UserRole.Member, status: AccountStatus.Active });
  const memberProfile = Object.assign(new Profile(), { userId: 'member-1', displayName: 'Alex', status: ProfileStatus.Approved });
  const interest = Object.assign(new Interest(), { id: 1, slug: 'marche', label: 'Marche' });
  const users = new Map([[owner.id, owner], [member.id, member]]);
  const profiles = new Map([[ownerProfile.userId, ownerProfile], [memberProfile.userId, memberProfile]]);

  const eventQuery = chain({ getMany: jest.fn(async () => events) });
  const countQuery = chain({
    getRawMany: jest.fn(async () => events.map((row) => ({ eventId: row.id, registeredCount: '2' }))),
  });
  const manager = {
    findOneBy: jest.fn(async (entity: unknown, where: { id?: string; userId?: string }) => {
      if (entity === User) return users.get(where.id ?? '') ?? null;
      if (entity === Profile) return profiles.get(where.userId ?? '') ?? null;
      return null;
    }),
    findBy: jest.fn(async (entity: unknown) => {
      if (entity === Interest) return [interest];
      if (entity === User) return [owner];
      if (entity === Profile) return [ownerProfile];
      return [];
    }),
    createQueryBuilder: jest.fn((entity: unknown) => entity === Event ? eventQuery : countQuery),
  };
  const service = new EventsService({ manager } as unknown as DataSource);
  return { service, manager, eventQuery, countQuery, owner, ownerProfile, member };
}

describe('Issue #17 — routes des sorties organisées et des inscriptions', () => {
  it('publie les deux routes sous /me avec le bon niveau d’accès', () => {
    expect(Reflect.getMetadata('path', MeEventsController)).toBe('me');
    expect(Reflect.getMetadata('path', MeEventsController.prototype.organizedEvents)).toBe('organized-events');
    expect(Reflect.getMetadata('method', MeEventsController.prototype.organizedEvents)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(ACCESS_LEVEL_KEY, MeEventsController.prototype.organizedEvents)).toBe('organizer');
    expect(Reflect.getMetadata('path', MeEventsController.prototype.registrations)).toBe('registrations');
    expect(Reflect.getMetadata('method', MeEventsController.prototype.registrations)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(ACCESS_LEVEL_KEY, MeEventsController.prototype.registrations)).toBe('active');
  });

  it('ne renvoie à l’organisateur que ses sorties, tous statuts et dates confondus', async () => {
    const f = fixture([
      event('event-1', EventStatus.Draft, 3 * DAY),
      event('event-2', EventStatus.Published, DAY),
      event('event-3', EventStatus.Cancelled, 2 * DAY),
      event('event-4', EventStatus.Completed, -5 * DAY),
    ]);
    const list = await f.service.listOrganized('owner', {});
    expect(f.eventQuery.where).toHaveBeenCalledWith('event.organizer_id = :actorId', { actorId: 'owner' });
    expect(f.eventQuery.andWhere).not.toHaveBeenCalled();
    expect(list.map((row) => row.status)).toEqual(['draft', 'published', 'cancelled', 'completed']);
    expect(list.map((row) => row.isPast)).toEqual([false, false, false, true]);
    expect(list[0].availablePlaces).toBe(3);
  });

  it('filtre sur un statut demandé et ignore un « status » vide', async () => {
    const f = fixture([event('event-1', EventStatus.Draft, DAY)]);
    await f.service.listOrganized('owner', { status: EventStatus.Draft });
    expect(f.eventQuery.andWhere).toHaveBeenCalledWith('event.status = :status', { status: EventStatus.Draft });

    const other = fixture([event('event-1', EventStatus.Draft, DAY)]);
    await other.service.listOrganized('owner', {});
    expect(other.eventQuery.andWhere).not.toHaveBeenCalled();
  });

  it('refuse la liste des sorties organisées à un membre et à un profil non approuvé', async () => {
    const f = fixture([]);
    await expect(f.service.listOrganized('member-1', {})).rejects.toMatchObject({
      response: { statusCode: 403, code: 'ROLE_REQUIRED' },
    });
    f.ownerProfile.status = ProfileStatus.Pending;
    await expect(f.service.listOrganized('owner', {})).rejects.toMatchObject({
      response: { statusCode: 403, code: 'PROFILE_NOT_APPROVED' },
    });
    expect(f.eventQuery.getMany).not.toHaveBeenCalled();
  });

  it('ne garde que les inscriptions actives et respecte la portée demandée', async () => {
    const upcoming = fixture([event('event-1', EventStatus.Published, DAY)]);
    await upcoming.service.listMyRegistrations('member-1', 'upcoming');
    expect(upcoming.eventQuery.innerJoin).toHaveBeenCalledWith(
      EventRegistration, 'registration',
      'registration.event_id = event.id AND registration.user_id = :actorId', { actorId: 'member-1' },
    );
    expect(upcoming.eventQuery.where).toHaveBeenCalledWith('registration.status = :registered', {
      registered: RegistrationStatus.Registered,
    });
    expect(upcoming.eventQuery.andWhere).toHaveBeenCalledWith('event.starts_at > :now', expect.anything());
    expect(upcoming.eventQuery.orderBy).toHaveBeenCalledWith('event.starts_at', 'ASC');

    const past = fixture([event('event-1', EventStatus.Completed, -DAY)]);
    await past.service.listMyRegistrations('member-1', 'past');
    expect(past.eventQuery.andWhere).toHaveBeenCalledWith('event.starts_at <= :now', expect.anything());
    expect(past.eventQuery.orderBy).toHaveBeenCalledWith('event.starts_at', 'DESC');
  });

  it('n’expose ni adresse exacte ni code postal dans les deux listes', async () => {
    const f = fixture([event('event-1', EventStatus.Published, DAY)]);
    const organized = JSON.stringify(await f.service.listOrganized('owner', {}));
    const registered = JSON.stringify(await f.service.listMyRegistrations('member-1', 'upcoming'));
    for (const payload of [organized, registered]) {
      expect(payload).not.toContain('12 rue des Lilas');
      expect(payload).not.toContain('69001');
      expect(payload).not.toContain('69381');
      expect(payload).toContain('"cityName":"Lyon"');
    }
  });
});
