import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { buildDataSourceOptions } from '../../src/database/typeorm.config';
import { EventRegistration, RegistrationStatus } from '../../src/events/event-registration.entity';
import { Event, EventStatus } from '../../src/events/event.entity';
import { Interest } from '../../src/interests/interest.entity';
import { Conversation } from '../../src/messaging/conversation.entity';
import { Message } from '../../src/messaging/message.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { assertTestDatabase } from './assert-test-database';

// La suite vide users : uniquement sur la base PostgreSQL jetable *_test.
describe('Issue #22 — confidentialité de la messagerie (bout en bout)', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let sequence = 0;
  const secret = 'SECRET-PRIVE-ISSUE-22';
  const http = () => request(app.getHttpServer());

  async function user(role = UserRole.Member): Promise<{ id: string; cookie: string }> {
    sequence += 1;
    const account = await db.getRepository(User).save({
      email: `messagerie${sequence}@example.test`, passwordHash: 'integration-test-only',
      role, status: AccountStatus.Active, sessionVersion: 0,
    });
    await db.getRepository(Profile).save({
      userId: account.id, displayName: `Membre ${sequence}`,
      cityName: 'Lyon', departmentCode: '69', status: ProfileStatus.Approved,
      allowMessages: true,
    });
    const token = await jwt.signAsync(
      { sub: account.id, sessionVersion: 0 },
      { secret: process.env.JWT_SECRET, expiresIn: '2h', algorithm: 'HS256' },
    );
    return { id: account.id, cookie: `rth_session=${token}` };
  }

  async function eligiblePair() {
    const organizer = await user(UserRole.Organizer);
    const a = await user();
    const b = await user();
    const interest = await db.getRepository(Interest).findOneOrFail({ where: {}, order: { id: 'ASC' } });
    const startsAt = new Date(Date.now() + 86400000);
    const event = await db.getRepository(Event).save({
      organizerId: organizer.id, interestId: interest.id, title: 'Rencontre conviviale',
      description: 'Un moment convivial entre membres.',
      startsAt, endsAt: new Date(startsAt.getTime() + 7200000),
      cityName: 'Lyon', departmentCode: '69', postalCode: '69001',
      exactAddress: 'Place des Terreaux', capacity: 5,
      status: EventStatus.Published, publishedAt: new Date(),
    });
    for (const member of [a, b]) {
      await db.getRepository(EventRegistration).save({
        eventId: event.id, userId: member.id, status: RegistrationStatus.Registered,
      });
    }
    return { a, b, eventId: event.id };
  }

  async function started() {
    const pair = await eligiblePair();
    const response = await http().post('/api/conversations')
      .set('Cookie', pair.a.cookie).send({ recipientId: pair.b.id, eventId: pair.eventId });
    expect(response.status).toBe(201);
    return { ...pair, id: response.body.id as string };
  }

  beforeAll(async () => {
    assertTestDatabase(process.env);
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
    db = new DataSource(buildDataSourceOptions(process.env));
    await db.initialize();
    await db.runMigrations();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { swagger: false });
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users CASCADE');
  });

  it('renvoie le même 404 au tiers et au modérateur en lecture et écriture, sans fuite', async () => {
    const { a, id } = await started();
    const outsider = await user();
    const moderator = await user(UserRole.Moderator);
    expect((await http().post(`/api/conversations/${id}/messages`)
      .set('Cookie', a.cookie).send({ body: secret })).status).toBe(201);

    for (const intruder of [outsider, moderator]) {
      const responses = [
        await http().get(`/api/conversations/${id}`).set('Cookie', intruder.cookie),
        await http().get(`/api/conversations/${id}/messages`).set('Cookie', intruder.cookie),
        await http().post(`/api/conversations/${id}/messages`)
          .set('Cookie', intruder.cookie).send({ body: 'Tentative de lecture' }),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('CONVERSATION_NOT_FOUND');
        expect(JSON.stringify(response.body)).not.toContain(secret);
      }
      const inbox = await http().get('/api/conversations').set('Cookie', intruder.cookie);
      expect(inbox.status).toBe(200);
      expect(inbox.body).toEqual([]);
    }
    expect(await db.getRepository(Message).countBy({ conversationId: id })).toBe(1);
  });

  it('refuse les messages vides, vides après nettoyage et trop longs sans insertion', async () => {
    const { a, id } = await started();
    for (const body of ['', '  \t\n  ', 'x'.repeat(1001)]) {
      const response = await http().post(`/api/conversations/${id}/messages`)
        .set('Cookie', a.cookie).send({ body });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(response.body)).not.toContain(secret);
    }
    expect(await db.getRepository(Message).countBy({ conversationId: id })).toBe(0);
  });

  it('réutilise la conversation dans les deux sens avec 200 et une seule paire en base', async () => {
    const { a, b, id, eventId } = await started();
    for (const [sender, recipient] of [[a, b], [b, a]] as const) {
      const response = await http().post('/api/conversations')
        .set('Cookie', sender.cookie).send({ recipientId: recipient.id, eventId });
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(id);
    }
    const [participantAId, participantBId] = [a.id, b.id].sort();
    expect(await db.getRepository(Conversation).countBy({ participantAId, participantBId })).toBe(1);
  });

  it('refuse l’envoi après suspension ou blocage et ne crée ni message ni fuite', async () => {
    const { a, b, id } = await started();
    expect((await http().post(`/api/conversations/${id}/messages`)
      .set('Cookie', a.cookie).send({ body: secret })).status).toBe(201);
    await db.getRepository(User).update({ id: a.id }, {
      status: AccountStatus.Suspended, suspendedAt: new Date(),
    });
    const suspended = await http().post(`/api/conversations/${id}/messages`)
      .set('Cookie', a.cookie).send({ body: 'Refusé' });
    expect(suspended.status).toBe(403);
    expect(suspended.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(JSON.stringify(suspended.body)).not.toContain(secret);

    await db.getRepository(Profile).update({ userId: b.id }, { status: ProfileStatus.Blocked });
    const blocked = await http().post(`/api/conversations/${id}/messages`)
      .set('Cookie', b.cookie).send({ body: 'Refusé' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PROFILE_BLOCKED');
    expect(JSON.stringify(blocked.body)).not.toContain(secret);
    expect(await db.getRepository(Message).countBy({ conversationId: id })).toBe(1);
  });
});
