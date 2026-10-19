import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../database/typeorm.config';
import { Interest } from '../interests/interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Event } from './event.entity';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

describe('Participants et adresse exacte (PostgreSQL)', () => {
  let db: DataSource;
  let events: EventsService;
  let registrations: RegistrationsService;
  const userIds: string[] = [];
  let eventId: string;
  let organizerId: string;
  let registeredId: string;
  let withdrawnId: string;
  let blockedId: string;
  let suspendedId: string;
  let bystanderId: string;
  let moderatorId: string;
  const address = '1 place des Terreaux, Lyon';

  async function user(role: UserRole, displayName: string): Promise<string> {
    const account = await db.manager.save(db.manager.create(User, {
      email: `${randomUUID()}@example.test`,
      passwordHash: 'integration-test-only',
      role,
      status: AccountStatus.Active,
    }));
    userIds.push(account.id);
    await db.manager.save(db.manager.create(Profile, {
      userId: account.id,
      displayName,
      cityName: 'Lyon',
      departmentCode: '69',
      status: ProfileStatus.Approved,
    }));
    return account.id;
  }

  beforeAll(async () => {
    config({ path: ['.env', '../.env'] });
    db = new DataSource(buildDataSourceOptions({ ...process.env, DATABASE_NAME: 're_tired_hearts_test' }));
    await db.initialize();
    await db.runMigrations();
    events = new EventsService(db);
    registrations = new RegistrationsService(db);
    organizerId = await user(UserRole.Organizer, 'Organisateur test');
    registeredId = await user(UserRole.Member, 'Inscrit visible');
    withdrawnId = await user(UserRole.Member, 'Inscrit retiré');
    blockedId = await user(UserRole.Member, 'Profil bloqué');
    suspendedId = await user(UserRole.Member, 'Compte suspendu');
    bystanderId = await user(UserRole.Member, 'Non inscrit');
    moderatorId = await user(UserRole.Moderator, 'Modérateur test');

    const startsAt = new Date(Date.now() + 86400000);
    const interest = await db.manager.findOneByOrFail(Interest, { slug: 'marche' });
    const event = await events.create(organizerId, {
      title: 'Rencontre de test',
      description: 'Une sortie fictive pour vérifier la confidentialité des participants.',
      interestId: interest.id,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3600000).toISOString(),
      location: { cityName: 'Lyon', postalCode: '69001', departmentCode: '69', verified: false },
      exactAddress: address,
      capacity: 5,
    });
    eventId = event.id;
    await events.publish(organizerId, eventId);
    for (const id of [registeredId, withdrawnId, blockedId, suspendedId]) {
      await registrations.register(id, eventId);
    }
    await registrations.withdraw(withdrawnId, eventId);
    await db.manager.update(Profile, { userId: blockedId }, { status: ProfileStatus.Blocked });
    await db.manager.update(User, { id: suspendedId }, {
      status: AccountStatus.Suspended,
      suspendedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    if (eventId) await db.manager.delete(Event, { id: eventId });
    for (const id of userIds) {
      await db.manager.delete(Profile, { userId: id });
      await db.manager.delete(User, { id });
    }
    await db.destroy();
  });

  it('réserve l’adresse exacte à l’organisateur, à l’inscrit et au modérateur', async () => {
    for (const id of [organizerId, registeredId, moderatorId]) {
      expect((await events.detail(id, eventId)).exactAddress).toBe(address);
    }
    for (const id of [withdrawnId, bystanderId]) {
      expect((await events.detail(id, eventId)).exactAddress).toBeNull();
    }
    await expect(events.detail(blockedId, eventId)).rejects.toMatchObject({
      response: { code: 'PROFILE_BLOCKED' },
    });
    await expect(events.detail(suspendedId, eventId)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SUSPENDED' },
    });
  });

  it('réserve la liste aux mêmes personnes et masque les comptes indisponibles', async () => {
    const visible = [{ userId: registeredId, displayName: 'Inscrit visible', isOrganizer: false }];
    for (const id of [organizerId, registeredId, moderatorId]) {
      expect(await events.participants(id, eventId)).toEqual(visible);
    }
    for (const id of [withdrawnId, bystanderId]) {
      await expect(events.participants(id, eventId)).rejects.toMatchObject({
        response: { code: 'FORBIDDEN' },
      });
    }
    await expect(events.participants(blockedId, eventId)).rejects.toMatchObject({
      response: { code: 'PROFILE_BLOCKED' },
    });
    await expect(events.participants(suspendedId, eventId)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SUSPENDED' },
    });
  });
});
