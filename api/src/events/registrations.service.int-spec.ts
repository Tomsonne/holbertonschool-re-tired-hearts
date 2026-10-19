import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { Interest } from '../interests/interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { EventRegistration, RegistrationStatus } from './event-registration.entity';
import { Event } from './event.entity';
import { EventInputDto } from './event-input.dto';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService (PostgreSQL)', () => {
  let db: DataSource;
  let events: EventsService;
  let registrations: RegistrationsService;
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let organizerId: string;
  let member1Id: string;
  let member2Id: string;
  let interestId: number;

  async function user(role: UserRole): Promise<string> {
    const account = await db.manager.save(db.manager.create(User, {
      email: `${randomUUID()}@example.test`,
      passwordHash: 'integration-test-only',
      role,
      status: AccountStatus.Active,
    }));
    userIds.push(account.id);
    await db.manager.save(db.manager.create(Profile, {
      userId: account.id,
      displayName: 'Profil de test',
      cityName: 'Lyon',
      departmentCode: '69',
      status: ProfileStatus.Approved,
    }));
    return account.id;
  }

  async function event(capacity: number): Promise<Event> {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const input: EventInputDto = {
      title: 'Atelier de cuisine',
      description: 'Un atelier convivial pour préparer un repas ensemble.',
      interestId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      location: { cityName: 'Lyon', postalCode: '69001', departmentCode: '69', verified: false },
      exactAddress: 'Place des Terreaux, Lyon',
      capacity,
    };
    const created = await events.create(organizerId, input);
    eventIds.push(created.id);
    return events.publish(organizerId, created.id);
  }

  beforeAll(async () => {
    config({ path: ['.env', '../.env'] });
    db = new DataSource(buildDataSourceOptions({ ...process.env, DATABASE_NAME: 're_tired_hearts_test' }));
    await db.initialize();
    await db.runMigrations();
    events = new EventsService(db);
    registrations = new RegistrationsService(db);
    interestId = (await db.manager.findOneByOrFail(Interest, { slug: 'cuisine' })).id;
    organizerId = await user(UserRole.Organizer);
    member1Id = await user(UserRole.Member);
    member2Id = await user(UserRole.Member);
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    for (const id of eventIds) await db.manager.delete(Event, { id });
    for (const id of userIds) {
      await db.manager.delete(Profile, { userId: id });
      await db.manager.delete(User, { id });
    }
    await db.destroy();
  });

  it('réutilise la même inscription après un retrait et libère la place', async () => {
    const outing = await event(1);
    expect(await registrations.register(member1Id, outing.id)).toEqual({ status: 'registered', availablePlaces: 0 });
    await expect(registrations.register(member1Id, outing.id)).rejects.toMatchObject({
      response: { code: 'ALREADY_REGISTERED' },
    });
    const before = await db.manager.findOneByOrFail(EventRegistration, { eventId: outing.id, userId: member1Id });
    expect(await registrations.withdraw(member1Id, outing.id)).toEqual({ status: 'withdrawn', availablePlaces: 1 });
    expect(await registrations.register(member1Id, outing.id)).toEqual({ status: 'registered', availablePlaces: 0 });
    const after = await db.manager.findOneByOrFail(EventRegistration, { eventId: outing.id, userId: member1Id });
    expect(after.id).toBe(before.id);
    expect(after.status).toBe(RegistrationStatus.Registered);
    expect(await db.manager.countBy(EventRegistration, { eventId: outing.id, userId: member1Id })).toBe(1);
  });

  it('réserve la dernière place une seule fois lors de deux demandes simultanées', async () => {
    const outing = await event(1);
    const outcomes = await Promise.allSettled([
      registrations.register(member1Id, outing.id),
      registrations.register(member2Id, outing.id),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ response: { code: 'EVENT_FULL' } });
    expect(await db.manager.countBy(EventRegistration, {
      eventId: outing.id,
      status: RegistrationStatus.Registered,
    })).toBe(1);
  });

  it('refuse son organisateur, un profil non approuvé et un événement annulé', async () => {
    const outing = await event(2);
    await expect(registrations.register(organizerId, outing.id)).rejects.toMatchObject({
      response: { code: 'OWN_EVENT' },
    });
    await db.manager.update(Profile, { userId: member1Id }, { status: ProfileStatus.Pending });
    await expect(registrations.register(member1Id, outing.id)).rejects.toMatchObject({
      response: { code: 'PROFILE_NOT_APPROVED' },
    });
    await db.manager.update(Profile, { userId: member1Id }, { status: ProfileStatus.Approved });
    await events.cancel(organizerId, outing.id, 'Sortie annulée');
    await expect(registrations.register(member1Id, outing.id)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_OPEN' },
    });
  });

  it('refuse une capacité sous le nombre inscrit et une sortie passée ou un compte suspendu', async () => {
    const outing = await event(2);
    await registrations.register(member1Id, outing.id);
    await registrations.register(member2Id, outing.id);
    await expect(events.update(organizerId, outing.id, { capacity: 1 })).rejects.toMatchObject({
      response: { code: 'CAPACITY_BELOW_REGISTRATIONS' },
    });

    const member3Id = await user(UserRole.Member);
    await db.manager.update(Event, { id: outing.id }, {
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await expect(registrations.register(member3Id, outing.id)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_OPEN' },
    });
    await db.manager.update(User, { id: member3Id }, {
      status: AccountStatus.Suspended,
      suspendedAt: new Date(),
    });
    await expect(registrations.register(member3Id, outing.id)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SUSPENDED' },
    });
  });
});
