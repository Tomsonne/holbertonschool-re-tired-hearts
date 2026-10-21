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
  let gate: InstanceType<typeof Client> | null = null;
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
    // La connexion tierce est libérée avant tout le reste, même si un test a échoué en la retenant.
    if (gate) {
      await gate.end().catch(() => undefined);
      gate = null;
    }
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

  // Une seule place libre sur la première sortie : le seed en réclame deux, l'inscription
  // ordinaire une seule. Les deux ne peuvent donc pas réussir ensemble.
  async function prepareContender() {
    const { demoMembers, foreignIds } = await occupyFirstEvent(1);
    const other = await db.manager.save(db.manager.create(User, {
      email: `${randomUUID()}@example.test`, passwordHash: 'integration-test-only',
      role: UserRole.Member, status: AccountStatus.Active,
    }));
    await db.manager.save(db.manager.create(Profile, {
      userId: other.id, displayName: 'Membre concurrent', cityName: 'Lyon',
      departmentCode: '69', status: ProfileStatus.Approved,
    }));
    return { demoMembers, foreignIds, other };
  }

  type Contenders = Awaited<ReturnType<typeof prepareContender>>;
  type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

  // Le gestionnaire est attaché dès l'appel : une opération refusée pendant que le test
  // attend le verrou ne remonte jamais comme rejet non traité.
  function settle<T>(operation: Promise<T>): Promise<Outcome<T>> {
    return operation.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  }

  function rejection(outcome: Outcome<unknown>): unknown {
    if (outcome.ok) throw new Error('Opération attendue en échec : elle a réussi.');
    return outcome.error;
  }

  // Retient le verrou d'écriture de la sortie depuis une connexion tierce : les deux
  // opérations s'alignent derrière lui dans leur ordre d'arrivée.
  async function holdEventLock(): Promise<void> {
    gate = new Client({
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5442),
      user: process.env.DATABASE_USER ?? 'rth',
      password: process.env.DATABASE_PASSWORD,
      database: name,
    });
    await gate.connect();
    await gate.query('BEGIN');
    await gate.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [DEMO_EVENTS[0].id]);
  }

  async function releaseEventLock(): Promise<void> {
    if (!gate) return;
    const held = gate;
    gate = null;
    await held.query('ROLLBACK');
    await held.end();
  }

  // PostgreSQL sert la file d'attente d'un verrou de ligne dans l'ordre d'arrivée :
  // attendre qu'une opération y patiente avant de lancer la suivante fixe l'ordre.
  async function waitForLockWaiters(expected: number): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt++) {
      const { rows } = await admin.query(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE datname = $1 AND wait_event_type = 'Lock'`,
        [name],
      );
      if (rows[0].waiting >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Verrou de sortie : ${expected} opération(s) en attente jamais observée(s).`);
  }

  // Le seed a gagné : il complète la sortie avec ses deux membres et l'inscription
  // ordinaire est refusée faute de place.
  async function expectSeedWon(
    contenders: Contenders,
    seed: Outcome<string[]>,
    registration: Outcome<unknown>,
  ): Promise<void> {
    expect(seed).toEqual({ ok: true, value: [] });
    expect(rejection(registration)).toMatchObject({ response: { code: 'EVENT_FULL' } });
    const event = await db.manager.findOneByOrFail(Event, { id: DEMO_EVENTS[0].id });
    expect(event.capacity).toBe(3);
    const registered = await db.manager.findBy(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, status: RegistrationStatus.Registered,
    });
    expect(registered).toHaveLength(3);
    expect(registered.length).toBeLessThanOrEqual(event.capacity);
    expect(registered.map((row) => row.userId).sort()).toEqual(
      [...contenders.foreignIds, ...contenders.demoMembers.map((member) => member.id)].sort(),
    );
    // Le membre concurrent n'a aucune ligne, pas même une ligne retirée.
    expect(await db.manager.countBy(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, userId: contenders.other.id,
    })).toBe(0);
    // Les deux membres inscrits rendent les deux conversations de démonstration éligibles.
    expect(await db.manager.count(Conversation)).toBe(2);
    expect(await db.manager.countBy(EventRegistration, {
      eventId: DEMO_EVENTS[1].id, status: RegistrationStatus.Registered,
    })).toBe(2);
  }

  // L'inscription ordinaire a gagné : le seed refuse ses deux ajouts faute de place et ne
  // laisse aucune inscription partielle derrière lui.
  async function expectRegistrationWon(
    contenders: Contenders,
    seed: Outcome<string[]>,
    registration: Outcome<{ status: RegistrationStatus.Registered; availablePlaces: number }>,
  ): Promise<void> {
    expect(registration).toEqual({
      ok: true, value: { status: RegistrationStatus.Registered, availablePlaces: 1 },
    });
    expect(rejection(seed)).toMatchObject({ message: expect.stringContaining('places insuffisantes') });
    const event = await db.manager.findOneByOrFail(Event, { id: DEMO_EVENTS[0].id });
    expect(event.capacity).toBe(3);
    const registered = await db.manager.findBy(EventRegistration, {
      eventId: DEMO_EVENTS[0].id, status: RegistrationStatus.Registered,
    });
    expect(registered).toHaveLength(2);
    expect(registered.length).toBeLessThanOrEqual(event.capacity);
    expect(registered.map((row) => row.userId).sort()).toEqual(
      [...contenders.foreignIds, contenders.other.id].sort(),
    );
    // Aucune inscription partielle : ni l'un ni l'autre des deux membres de démonstration.
    for (const member of contenders.demoMembers) {
      expect(await db.manager.countBy(EventRegistration, {
        eventId: DEMO_EVENTS[0].id, userId: member.id,
      })).toBe(0);
    }
    // Le seed s'arrête avant les conversations et ne touche pas la seconde sortie.
    expect(await db.manager.count(Conversation)).toBe(0);
    expect(await db.manager.countBy(EventRegistration, {
      eventId: DEMO_EVENTS[1].id, status: RegistrationStatus.Registered,
    })).toBe(2);
  }

  it('complète la sortie quand le seed obtient le verrou avant l’inscription ordinaire', async () => {
    const contenders = await prepareContender();
    await holdEventLock();
    const seed = settle(seedDemoData(db, password));
    await waitForLockWaiters(1);
    const registration = settle(new RegistrationsService(db).register(contenders.other.id, DEMO_EVENTS[0].id));
    await waitForLockWaiters(2);
    await releaseEventLock();
    await expectSeedWon(contenders, await seed, await registration);
  });

  it('refuse les deux ajouts du seed quand l’inscription ordinaire obtient le verrou avant lui', async () => {
    const contenders = await prepareContender();
    await holdEventLock();
    const registration = settle(new RegistrationsService(db).register(contenders.other.id, DEMO_EVENTS[0].id));
    await waitForLockWaiters(1);
    const seed = settle(seedDemoData(db, password));
    await waitForLockWaiters(2);
    await releaseEventLock();
    await expectRegistrationWon(contenders, await seed, await registration);
  });

  it('partage le verrou de sortie avec une inscription ordinaire concurrente', async () => {
    const contenders = await prepareContender();
    const seed = settle(seedDemoData(db, password));
    const registration = settle(new RegistrationsService(db).register(contenders.other.id, DEMO_EVENTS[0].id));
    const [seedOutcome, registrationOutcome] = await Promise.all([seed, registration]);
    expect([seedOutcome, registrationOutcome].filter((outcome) => outcome.ok)).toHaveLength(1);
    // L'ordre réel n'est pas imposé ici : chaque issue est vérifiée en entier selon le gagnant.
    if (seedOutcome.ok) await expectSeedWon(contenders, seedOutcome, registrationOutcome);
    else await expectRegistrationWon(contenders, seedOutcome, registrationOutcome);
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
