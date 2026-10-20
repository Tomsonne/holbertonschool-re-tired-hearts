import { RequestMethod } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventRegistration, RegistrationStatus } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';
import { Interest } from '../../src/interests/interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

function fixture() {
  const actor = Object.assign(new User(), { id: 'viewer', role: UserRole.Member, status: AccountStatus.Active });
  const actorProfile = Object.assign(new Profile(), { userId: 'viewer', status: ProfileStatus.Approved });
  const organizer = Object.assign(new User(), { id: 'owner', role: UserRole.Organizer, status: AccountStatus.Active });
  const organizerProfile = Object.assign(new Profile(), { userId: 'owner', displayName: 'Camille', status: ProfileStatus.Approved });
  const interest = Object.assign(new Interest(), { id: 1, slug: 'marche', label: 'Marche' });
  const event = Object.assign(new Event(), {
    id: 'event-1', organizerId: 'owner', interestId: 1, status: EventStatus.Published,
    title: 'Promenade', description: 'Promenade de quartier',
    startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000),
    cityName: 'Lyon', departmentCode: '69', postalCode: '69001',
    exactAddress: '12 rue des Lilas', capacity: 5, cancellationReason: null,
  });
  let registration: EventRegistration | null = null;
  const query: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy']) {
    query[method] = jest.fn(() => query);
  }
  query.getRawMany = jest.fn(async () => [
    { userId: 'member-1', displayName: 'Alex', role: UserRole.Organizer, email: 'prive@example.test' },
  ]);
  const manager = {
    findOneBy: jest.fn(async (entity: unknown, where: { id?: string; userId?: string }) => {
      if (entity === User) return where.id === organizer.id ? organizer : actor;
      if (entity === Profile) return where.userId === organizer.id ? organizerProfile : actorProfile;
      if (entity === Event) return event;
      if (entity === EventRegistration) return registration;
      return null;
    }),
    findOneByOrFail: jest.fn(async (entity: unknown) => entity === Interest ? interest : organizer),
    countBy: jest.fn(async () => 1),
    createQueryBuilder: jest.fn(() => query),
  };
  const service = new EventsService({ manager } as unknown as DataSource);
  return {
    service, actor, manager, query,
    set registration(value: EventRegistration | null) { registration = value; },
  };
}

describe('Issue #15 — liste des participants et adresse exacte', () => {
  it('publie la route GET des participants', () => {
    expect(Reflect.getMetadata('path', EventsController.prototype.participants)).toBe(':id/participants');
    expect(Reflect.getMetadata('method', EventsController.prototype.participants)).toBe(RequestMethod.GET);
  });

  it.each([
    ['organisateur', 'owner', UserRole.Organizer, null],
    ['inscrit', 'member-1', UserRole.Member, RegistrationStatus.Registered],
    ['modérateur', 'moderator', UserRole.Moderator, null],
  ] as const)('autorise l’adresse et la liste à %s', async (_label, userId, role, status) => {
    const f = fixture();
    f.actor.id = userId;
    f.actor.role = role;
    f.registration = status ? Object.assign(new EventRegistration(), { status }) : null;
    await expect(f.service.detail(userId, 'event-1')).resolves.toMatchObject({ exactAddress: '12 rue des Lilas' });
    await expect(f.service.participants(userId, 'event-1')).resolves.toEqual([
      { userId: 'member-1', displayName: 'Alex', isOrganizer: false },
    ]);
  });

  it.each([
    ['visiteur non inscrit', null],
    ['ancien inscrit', RegistrationStatus.Withdrawn],
  ] as const)('cache l’adresse et refuse la liste à %s', async (_label, status) => {
    const f = fixture();
    f.registration = status ? Object.assign(new EventRegistration(), { status }) : null;
    await expect(f.service.detail('viewer', 'event-1')).resolves.toMatchObject({ exactAddress: null });
    await expect(f.service.participants('viewer', 'event-1')).rejects.toMatchObject({
      response: { statusCode: 403, code: 'FORBIDDEN' },
    });
    expect(f.manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('filtre les profils actifs et approuvés sans exposer leur e-mail', async () => {
    const f = fixture();
    f.actor.role = UserRole.Moderator;
    const list = await f.service.participants('viewer', 'event-1');
    expect(f.query.andWhere).toHaveBeenCalledWith('registration.status = :registered', { registered: RegistrationStatus.Registered });
    expect(f.query.andWhere).toHaveBeenCalledWith('participant.status = :active', { active: AccountStatus.Active });
    expect(f.query.andWhere).toHaveBeenCalledWith('profile.status = :approved', { approved: ProfileStatus.Approved });
    expect(JSON.stringify(list)).not.toContain('prive@example.test');
    expect(JSON.stringify(list)).not.toContain('email');
    expect(list[0].isOrganizer).toBe(false);
    expect(f.query.addSelect).not.toHaveBeenCalledWith('participant.role', 'role');
  });
});
