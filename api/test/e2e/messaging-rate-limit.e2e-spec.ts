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
import {
  SEND_MESSAGE_LIMIT,
  SEND_MESSAGE_WINDOW_MS,
} from '../../src/messaging/conversations.controller';
import { Message } from '../../src/messaging/message.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { assertTestDatabase } from './assert-test-database';

// La suite vide users : uniquement sur la base PostgreSQL jetable *_test.
// R-MSG-8 : 30 envois par tranche de 10 minutes et par compte.
describe('R-MSG-8 — quota d’envoi de messages (bout en bout)', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let sequence = 0;
  type Account = { id: string; cookie: string };
  const http = () => request(app.getHttpServer());

  async function user(role = UserRole.Member): Promise<Account> {
    sequence += 1;
    const account = await db.getRepository(User).save({
      email: `quota${sequence}@example.test`, passwordHash: 'integration-test-only',
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

  // Une sortie publiée et des membres inscrits : toutes les paires sont éligibles.
  async function eligibleMembers(count: number): Promise<{ members: Account[]; eventId: string }> {
    const organizer = await user(UserRole.Organizer);
    const members: Account[] = [];
    for (let index = 0; index < count; index += 1) members.push(await user());
    const interest = await db.getRepository(Interest).findOneOrFail({ where: {}, order: { id: 'ASC' } });
    const startsAt = new Date(Date.now() + 86400000);
    const event = await db.getRepository(Event).save({
      organizerId: organizer.id, interestId: interest.id, title: 'Rencontre conviviale',
      description: 'Un moment convivial entre membres.',
      startsAt, endsAt: new Date(startsAt.getTime() + 7200000),
      cityName: 'Lyon', departmentCode: '69', postalCode: '69001',
      exactAddress: 'Place des Terreaux', capacity: 20,
      status: EventStatus.Published, publishedAt: new Date(),
    });
    for (const member of members) {
      await db.getRepository(EventRegistration).save({
        eventId: event.id, userId: member.id, status: RegistrationStatus.Registered,
      });
    }
    return { members, eventId: event.id };
  }

  async function conversationBetween(from: Account, to: Account, eventId: string): Promise<string> {
    const response = await http().post('/api/conversations')
      .set('Cookie', from.cookie).send({ recipientId: to.id, eventId });
    expect([200, 201]).toContain(response.status);
    return response.body.id as string;
  }

  function send(account: Account, conversationId: string, body: unknown) {
    return http().post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', account.cookie).send({ body });
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

  // Chaque test repart de comptes neufs : le compteur est indexé sur l'identifiant du
  // compte, donc aucun quota ne traîne d'un test à l'autre.
  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users CASCADE');
  });

  it('annonce la limite, refuse le 31e envoi et laisse l’autre participant écrire', async () => {
    expect(SEND_MESSAGE_LIMIT).toBe(30);
    expect(SEND_MESSAGE_WINDOW_MS).toBe(600_000);
    const { members: [a, b], eventId } = await eligibleMembers(2);
    const id = await conversationBetween(a, b, eventId);

    for (let index = 1; index <= SEND_MESSAGE_LIMIT; index += 1) {
      const response = await send(a, id, `Message ${index}`);
      expect(response.status).toBe(201);
      expect(response.headers['x-ratelimit-limit']).toBe(String(SEND_MESSAGE_LIMIT));
      expect(response.headers['x-ratelimit-remaining']).toBe(String(SEND_MESSAGE_LIMIT - index));
    }

    const refused = await send(a, id, 'Un de trop');
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({
      statusCode: 429, code: 'TOO_MANY_REQUESTS',
      message: 'Trop de tentatives. Merci de patienter quelques minutes.',
    });
    expect(refused.headers['retry-after']).toBeDefined();
    expect(await db.getRepository(Message).countBy({ conversationId: id })).toBe(SEND_MESSAGE_LIMIT);

    // Le quota suit le compte : celui de l'autre participant est intact.
    const other = await send(b, id, 'Réponse');
    expect(other.status).toBe(201);
    expect(other.headers['x-ratelimit-remaining']).toBe(String(SEND_MESSAGE_LIMIT - 1));
    expect(await db.getRepository(Message).countBy({ conversationId: id })).toBe(SEND_MESSAGE_LIMIT + 1);
    // Et le compte bloqué le reste tant que la fenêtre n'est pas écoulée.
    expect((await send(a, id, 'Encore un')).status).toBe(429);
  });

  it('compte les tentatives refusées et suit le compte d’une conversation à l’autre', async () => {
    const { members: [a, b, c], eventId } = await eligibleMembers(3);
    const first = await conversationBetween(a, b, eventId);
    const second = await conversationBetween(a, c, eventId);

    for (let index = 1; index <= SEND_MESSAGE_LIMIT - 1; index += 1) {
      expect((await send(a, first, `Message ${index}`)).status).toBe(201);
    }
    // 30e tentative : refusée sur le contenu, elle consomme malgré tout une unité.
    const invalid = await send(a, first, '   ');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
    expect(invalid.headers['x-ratelimit-remaining']).toBe('0');

    // 31e tentative : valide, dans une autre conversation, et pourtant refusée.
    const blocked = await send(a, second, 'Bonjour');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(await db.getRepository(Message).countBy({ conversationId: first })).toBe(SEND_MESSAGE_LIMIT - 1);
    expect(await db.getRepository(Message).countBy({ conversationId: second })).toBe(0);
    // Le quota ne touche pas la lecture de l'historique.
    const history = await http().get(`/api/conversations/${first}/messages`).set('Cookie', a.cookie);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(SEND_MESSAGE_LIMIT - 1);
  });
});
