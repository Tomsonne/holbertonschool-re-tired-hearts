import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventRegistration, RegistrationStatus } from '../events/event-registration.entity';
import { Event, EventStatus } from '../events/event.entity';
import { RegistrationsService } from '../events/registrations.service';
import { Conversation } from '../messaging/conversation.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { buildDataSourceOptions } from './typeorm.config';
import { DEMO_ACCOUNTS, DEMO_EVENTS, seedDemoData } from './seed';

const { Client } = require('pg');
config({ path: ['.env', '../.env'] });
jest.setTimeout(30000);

describe('seed complet (PostgreSQL jetable)', () => {
  let admin: InstanceType<typeof Client>;
  let db: DataSource;
  let name: string;
  const password = 'MotDePasseDemo2026!';

  beforeEach(async () => {
    if (!process.env.DATABASE_PASSWORD) throw new Error('DATABASE_PASSWORD requis pour le test PostgreSQL jetable.');
    name = `re_tired_hearts_demo_test_${Date.now()}${Math.floor(Math.random() * 1000)}`;
    admin = new Client({
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5442),
      user: process.env.DATABASE_USER ?? 'rth',
      password: process.env.DATABASE_PASSWORD,
      database: 'postgres',
    });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    db = new DataSource(buildDataSourceOptions({ ...process.env, DATABASE_NAME: name }));
    await db.initialize();
    await db.runMigrations();
  });

  afterEach(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      if (name) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function demoUsers() {
    const users = await db.manager.find(User);
    return new Map(users.map((user) => [user.email, user]));
  }

  async function verifyGraph() {
    const users = await demoUsers();
    expect([...users.keys()].sort()).toEqual(DEMO_ACCOUNTS.map((account) => account.email).sort());
    for (const account of DEMO_ACCOUNTS) {
      const user = users.get(account.email)!;
      const profile = await db.manager.findOneByOrFail(Profile, { userId: user.id });
      expect(user.role).toBe(account.role);
      expect(user.status).toBe(AccountStatus.Active);
      expect(profile.status).toBe(ProfileStatus.Approved);
      expect(profile.reviewedAt).not.toBeNull();
    }
    const organizer = users.get(DEMO_ACCOUNTS[1].email)!;
    const members = [users.get(DEMO_ACCOUNTS[2].email)!, users.get(DEMO_ACCOUNTS[3].email)!];
    for (const definition of DEMO_EVENTS) {
      const event = await db.manager.findOneByOrFail(Event, { id: definition.id });
      expect(event.organizerId).toBe(organizer.id);
      expect(event.status).toBe(EventStatus.Published);
      expect(event.capacity).toBe(definition.capacity);
      const registrations = await db.manager.findBy(EventRegistration, { eventId: event.id });
      expect(registrations).toHaveLength(2);
      expect(registrations.every((registration) => registration.status === RegistrationStatus.Registered)).toBe(true);
      expect(registrations.map((registration) => registration.userId).sort()).toEqual(members.map((member) => member.id).sort());
      expect(registrations.length).toBeLessThanOrEqual(event.capacity);
    }
    const conversations = await db.manager.find(Conversation);
    expect(conversations).toHaveLength(2);
    for (const conversation of conversations) {
      expect(conversation.participantAId < conversation.participantBId).toBe(true);
      expect(conversation.contextEventId).toBe(DEMO_EVENTS[0].id);
      const participants = [conversation.participantAId, conversation.participantBId];
      expect(participants.every((id) => id === organizer.id || members.some((member) => member.id === id))).toBe(true);
      for (const id of participants.filter((id) => id !== organizer.id)) {
        expect(await db.manager.findOneBy(EventRegistration, {
          eventId: DEMO_EVENTS[0].id, userId: id, status: RegistrationStatus.Registered,
        })).not.toBeNull();
      }
    }
  }

  async function occupyFirstEvent(occupied: number) {
    await seedDemoData(db, password);
    await db.createQueryBuilder().delete().from(Conversation).execute();
    const users = await demoUsers();
    const demoMembers = [users.get(DEMO_ACCOUNTS[2].email)!, users.get(DEMO_ACCOUNTS[3].email)!];
    for (const member of demoMembers) {
      await db.manager.delete(EventRegistration, { eventId: DEMO_EVENTS[0].id, userId: member.id });
    }
    const foreignIds: string[] = [];
    for (let index = 0; index < occupied; index++) {
      const foreign = await db.manager.save(db.manager.create(User, {
        email: `${randomUUID()}@example.test`, passwordHash: 'integration-test-only',
        role: UserRole.Member, status: AccountStatus.Active,
      }));
      foreignIds.push(foreign.id);
      await db.manager.save(db.manager.create(Profile, {
        userId: foreign.id, displayName: 'Autre membre', cityName: 'Lyon',
        departmentCode: '69', status: ProfileStatus.Approved,
      }));
      await db.manager.save(db.manager.create(EventRegistration, {
        eventId: DEMO_EVENTS[0].id, userId: foreign.id, status: RegistrationStatus.Registered,
      }));
    }
    return { demoMembers, foreignIds };
  }

  it('crée des relations valides au premier passage', async () => {
    expect(await seedDemoData(db, password)).toEqual(DEMO_ACCOUNTS.map((account) => account.email));
    await verifyGraph();
  });

  it('ne crée aucun doublon au rejeu', async () => {
    await seedDemoData(db, password);
    const before = {
      users: (await db.manager.find(User)).map((row) => row.id).sort(),
      events: (await db.manager.find(Event)).map((row) => row.id).sort(),
      registrations: (await db.manager.find(EventRegistration)).map((row) => row.id).sort(),
      conversations: (await db.manager.find(Conversation)).map((row) => row.id).sort(),
    };
    expect(await seedDemoData(db, password)).toEqual([]);
    expect({
      users: (await db.manager.find(User)).map((row) => row.id).sort(),
      events: (await db.manager.find(Event)).map((row) => row.id).sort(),
      registrations: (await db.manager.find(EventRegistration)).map((row) => row.id).sort(),
      conversations: (await db.manager.find(Conversation)).map((row) => row.id).sort(),
    }).toEqual(before);
    await verifyGraph();
  });

  it.each([3, 2])('refuse une sortie avec %i inscrits actifs et des places insuffisantes', async (occupied) => {
    const { demoMembers, foreignIds } = await occupyFirstEvent(occupied);
    await expect(seedDemoData(db, password)).rejects.toThrow('places insuffisantes');
    const event = await db.manager.findOneByOrFail(Event, { id: DEMO_EVENTS[0].id });
    expect(event.capacity).toBe(3);
    const registrations = await db.manager.findBy(EventRegistration, { eventId: event.id });
    expect(registrations).toHaveLength(occupied);
    expect(registrations.every((row) => row.status === RegistrationStatus.Registered)).toBe(true);
    expect(registrations.map((row) => row.userId).sort()).toEqual(foreignIds.sort());
    expect(registrations.some((row) => demoMembers.some((member) => member.id === row.userId))).toBe(false);
    expect(await db.manager.count(Conversation)).toBe(0);
  });

  it('ignore les lignes withdrawn dans le calcul des places', async () => {
    const { foreignIds } = await occupyFirstEvent(2);
    const withdrawn = await db.manager.findOneByOrFail(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, userId: foreignIds[0],
    });
    withdrawn.status = RegistrationStatus.Withdrawn;
    withdrawn.withdrawnAt = new Date();
    await db.manager.save(withdrawn);
    await seedDemoData(db, password);
    const registrations = await db.manager.findBy(EventRegistration, { eventId: DEMO_EVENTS[0].id });
    expect(registrations.filter((row) => row.status === RegistrationStatus.Registered)).toHaveLength(3);
    expect(registrations.find((row) => row.id === withdrawn.id)?.status).toBe(RegistrationStatus.Withdrawn);
    expect(await db.manager.count(Conversation)).toBe(2);
  });

  it('partage le verrou de sortie avec une inscription ordinaire concurrente', async () => {
    const { demoMembers } = await occupyFirstEvent(1);
    const other = await db.manager.save(db.manager.create(User, {
      email: `${randomUUID()}@example.test`, passwordHash: 'integration-test-only',
      role: UserRole.Member, status: AccountStatus.Active,
    }));
    await db.manager.save(db.manager.create(Profile, {
      userId: other.id, displayName: 'Membre concurrent', cityName: 'Lyon',
      departmentCode: '69', status: ProfileStatus.Approved,
    }));
    const results = await Promise.allSettled([
      seedDemoData(db, password),
      new RegistrationsService(db).register(other.id, DEMO_EVENTS[0].id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const registrations = await db.manager.findBy(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, status: RegistrationStatus.Registered,
    });
    expect(registrations).toHaveLength(3);
    const demoCount = registrations.filter((row) => demoMembers.some((member) => member.id === row.userId)).length;
    expect([0, 2]).toContain(demoCount);
    expect(registrations.length).toBeLessThanOrEqual((await db.manager.findOneByOrFail(Event, { id: DEMO_EVENTS[0].id })).capacity);
  });

  it('ne réactive pas une inscription retirée et ne recrée pas une conversation inéligible', async () => {
    await seedDemoData(db, password);
    const users = await demoUsers();
    const withdrawn = await db.manager.findOneByOrFail(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, userId: users.get(DEMO_ACCOUNTS[2].email)!.id,
    });
    await db.createQueryBuilder().delete().from(Conversation).execute();
    withdrawn.status = RegistrationStatus.Withdrawn;
    withdrawn.withdrawnAt = new Date();
    await db.manager.save(withdrawn);
    await seedDemoData(db, password);
    expect((await db.manager.findOneByOrFail(EventRegistration, { id: withdrawn.id })).status).toBe(RegistrationStatus.Withdrawn);
    expect(await db.manager.count(Conversation)).toBe(0);
  });
});
