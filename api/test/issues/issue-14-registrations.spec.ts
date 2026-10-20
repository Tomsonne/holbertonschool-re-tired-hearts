import { Reflector } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import { ACCESS_LEVEL_KEY } from '../../src/auth/auth.decorators';
import { EventRegistration, RegistrationStatus } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { EventsController } from '../../src/events/events.controller';
import { EventsService } from '../../src/events/events.service';
import { RegistrationsService } from '../../src/events/registrations.service';
import { Interest } from '../../src/interests/interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

function fixture() {
  const rows: EventRegistration[] = [];
  const operations: string[] = [];
  const event = Object.assign(new Event(), {
    id: 'event-1', organizerId: 'owner', status: EventStatus.Published,
    title: 'Promenade', description: 'Sortie conviviale', interestId: 1,
    startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000),
    cityName: 'Lyon', departmentCode: '69', postalCode: '69001', cityCode: null,
    locationVerified: false, areaHint: null, exactAddress: '12 rue des Lilas', capacity: 2,
  });
  const actor = Object.assign(new User(), { id: 'member-1', role: UserRole.Member, status: AccountStatus.Active });
  const profile = Object.assign(new Profile(), { userId: actor.id, status: ProfileStatus.Approved });
  const manager = {
    findOneBy: jest.fn(async (entity: unknown, where: { eventId?: string; userId?: string; status?: RegistrationStatus }) => {
      if (entity === User) return actor;
      if (entity === Profile) return profile;
      if (entity === EventRegistration) return rows.find((row) => row.eventId === where.eventId &&
        row.userId === where.userId && (!where.status || row.status === where.status)) ?? null;
      return null;
    }),
    findOne: jest.fn(async () => { operations.push('lock'); return event; }),
    countBy: jest.fn(async (entity: unknown) => {
      operations.push('count');
      return entity === EventRegistration ? rows.filter((row) => row.status === RegistrationStatus.Registered).length : 0;
    }),
    existsBy: jest.fn(async (entity: unknown) => entity === Interest),
    create: jest.fn((entity: new () => object, values: object) => Object.assign(new entity(), values)),
    save: jest.fn(async (value: EventRegistration | Event) => {
      if (value instanceof EventRegistration && !rows.includes(value)) rows.push(value);
      return value;
    }),
  };
  const db = {
    transaction: jest.fn(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as (entityManager: EntityManager) => Promise<unknown>;
      return callback(manager as unknown as EntityManager);
    }),
  } as unknown as DataSource;
  return { service: new RegistrationsService(db), events: new EventsService(db), event, actor, profile, rows, manager, operations };
}

describe('Issue #14 — inscriptions et capacité atomique', () => {
  it('exige un profil approuvé pour l’inscription et un compte actif pour le retrait', () => {
    const reflector = new Reflector();
    expect(reflector.get(ACCESS_LEVEL_KEY, EventsController.prototype.register)).toBe('approved');
    expect(reflector.get(ACCESS_LEVEL_KEY, EventsController.prototype.withdraw)).toBe('active');
  });

  it('permet le retrait après perte de l’approbation du profil', async () => {
    const f = fixture();
    await f.service.register('member-1', 'event-1');
    f.profile.status = ProfileStatus.Blocked;
    await expect(f.service.withdraw('member-1', 'event-1')).resolves.toEqual({
      status: RegistrationStatus.Withdrawn, availablePlaces: 2,
    });
  });

  it('cache un brouillon lors d’une demande d’inscription', async () => {
    const f = fixture();
    f.event.status = EventStatus.Draft;
    await expect(f.service.register('member-1', 'event-1')).rejects.toMatchObject({
      response: { statusCode: 404, code: 'EVENT_NOT_FOUND' },
    });
  });

  it('verrouille l’événement avant de compter les places', async () => {
    const f = fixture();
    await f.service.register('member-1', 'event-1');
    expect(f.manager.findOne).toHaveBeenCalledWith(Event, {
      where: { id: 'event-1' }, lock: { mode: 'pessimistic_write' },
    });
    expect(f.operations.indexOf('lock')).toBeLessThan(f.operations.indexOf('count'));
  });

  it('réactive la même ligne après désinscription, sans doublon', async () => {
    const f = fixture();
    await expect(f.service.register('member-1', 'event-1')).resolves.toEqual({ status: 'registered', availablePlaces: 1 });
    await expect(f.service.withdraw('member-1', 'event-1')).resolves.toEqual({ status: 'withdrawn', availablePlaces: 2 });
    expect(f.rows[0].withdrawnAt).toBeInstanceOf(Date);
    await expect(f.service.register('member-1', 'event-1')).resolves.toEqual({ status: 'registered', availablePlaces: 1 });
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({ status: RegistrationStatus.Registered, withdrawnAt: null });
  });

  it('refuse l’organisateur et une sortie pleine', async () => {
    const f = fixture();
    f.actor.id = 'owner';
    await expect(f.service.register('owner', 'event-1')).rejects.toMatchObject({ response: { code: 'OWN_EVENT' } });
    f.actor.id = 'member-2';
    f.event.capacity = 1;
    f.rows.push(Object.assign(new EventRegistration(), {
      eventId: 'event-1', userId: 'member-1', status: RegistrationStatus.Registered,
    }));
    await expect(f.service.register('member-2', 'event-1')).rejects.toMatchObject({ response: { code: 'EVENT_FULL' } });
    expect(f.rows).toHaveLength(1);
  });

  it('interdit de réduire la capacité sous le nombre d’inscrits', async () => {
    const f = fixture();
    f.actor.id = 'owner';
    f.actor.role = UserRole.Organizer;
    f.rows.push(...['member-1', 'member-2'].map((userId) => Object.assign(new EventRegistration(), {
      eventId: 'event-1', userId, status: RegistrationStatus.Registered,
    })));
    await expect(f.events.update('owner', 'event-1', { capacity: 1 })).rejects.toMatchObject({
      response: { code: 'CAPACITY_BELOW_REGISTRATIONS' },
    });
    expect(f.event.capacity).toBe(2);
  });
});
