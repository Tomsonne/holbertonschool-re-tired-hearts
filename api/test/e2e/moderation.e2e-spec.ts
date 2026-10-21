import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { buildDataSourceOptions } from '../../src/database/typeorm.config';
import { Event, EventStatus } from '../../src/events/event.entity';
import { Interest } from '../../src/interests/interest.entity';
import { ProfileInterest } from '../../src/profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { assertTestDatabase } from './assert-test-database';

// Tests bout en bout de l'issue #23 : vraie application, vraie base PostgreSQL migrée.
// Comme authorization.e2e-spec.ts, ils vident la table users : base jetable uniquement.

type Seeded = { id: string; cookie: string };

describe('Issue #23 — modération et journal d’audit (bout en bout)', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let sequence = 0;

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
    await db?.query('DROP TRIGGER IF EXISTS fail_audit ON moderation_actions');
    await app?.close();
    await db?.destroy();
  });

  beforeEach(async () => {
    await db.query('DROP TRIGGER IF EXISTS fail_audit ON moderation_actions');
    await db.query('TRUNCATE TABLE moderation_actions, events, users CASCADE');
  });

  async function seed(
    options: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      profileStatus?: ProfileStatus;
    } = {},
  ): Promise<Seeded> {
    sequence += 1;
    const suspended = options.accountStatus === AccountStatus.Suspended;
    const user = await db.getRepository(User).save({
      email: `mod${sequence}@example.test`,
      passwordHash: 'pas-un-vrai-hash',
      role: options.role ?? UserRole.Member,
      status: options.accountStatus ?? AccountStatus.Active,
      suspendedAt: suspended ? new Date() : null,
      sessionVersion: 0,
    });
    await db.getRepository(Profile).save({
      userId: user.id,
      displayName: `Membre ${sequence}`,
      status: options.profileStatus ?? ProfileStatus.Pending,
      cityName: 'Lyon',
      departmentCode: '69',
      postalCode: '69001',
      cityCode: '69123',
    });
    const interest = await db.getRepository(Interest).findOneOrFail({ where: {}, order: { id: 'ASC' } });
    await db.getRepository(ProfileInterest).insert({ profileId: user.id, interestId: interest.id });
    return { id: user.id, cookie: await cookieFor(user.id, 0) };
  }

  async function cookieFor(userId: string, sessionVersion: number): Promise<string> {
    const token = await jwt.signAsync(
      { sub: userId, sessionVersion },
      { secret: process.env.JWT_SECRET, expiresIn: '2h', algorithm: 'HS256' },
    );
    return `rth_session=${token}`;
  }

  async function seedEvent(organizerId: string, status = EventStatus.Published): Promise<string> {
    const interest = await db.getRepository(Interest).findOneOrFail({ where: {}, order: { id: 'ASC' } });
    const event = await db.getRepository(Event).save({
      organizerId,
      interestId: interest.id,
      title: 'Balade au parc',
      description: 'Une promenade tranquille.',
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      cityName: 'Lyon',
      departmentCode: '69',
      postalCode: '69001',
      exactAddress: '1 rue du Parc',
      capacity: 10,
      status,
      publishedAt: new Date(),
      ...(status === EventStatus.Cancelled
        ? { cancelledAt: new Date(), cancellationReason: 'déjà annulé' }
        : {}),
    });
    return event.id;
  }

  const http = () => request(app.getHttpServer());
  const auditRows = () => db.query('SELECT * FROM moderation_actions');
  const profileStatus = async (userId: string) =>
    (await db.getRepository(Profile).findOneByOrFail({ userId })).status;
  const REASON = 'Motif de test';

  describe('chaque action écrit exactement une ligne de journal', () => {
    it('approve → block → unblock', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();

      for (const [action, body, expected] of [
        ['approve', {}, 'approved'],
        ['block', { reason: REASON }, 'blocked'],
        ['unblock', {}, 'approved'],
      ] as const) {
        const before = (await auditRows()).length;
        const response = await http()
          .post(`/api/moderation/profiles/${member.id}/${action}`)
          .set('Cookie', mod.cookie)
          .send(body);
        expect(response.status).toBe(200);
        expect(response.body.status).toBe(expected);
        expect((await auditRows()).length).toBe(before + 1);
      }
      const actions = await db.query('SELECT action, moderator_id, target_user_id FROM moderation_actions ORDER BY created_at');
      expect(actions.map((row: { action: string }) => row.action)).toEqual([
        'approve_profile',
        'block_profile',
        'unblock_profile',
      ]);
      expect(actions.every((row: { moderator_id: string }) => row.moderator_id === mod.id)).toBe(true);
    });

    it('suspend → reactivate (session_version incrémenté à la suspension)', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();

      const suspend = await http()
        .post(`/api/moderation/users/${member.id}/suspend`)
        .set('Cookie', mod.cookie)
        .send({ reason: REASON });
      expect(suspend.status).toBe(200);
      expect(suspend.body.status).toBe('suspended');
      expect((await db.getRepository(User).findOneByOrFail({ id: member.id })).sessionVersion).toBe(1);

      const reactivate = await http()
        .post(`/api/moderation/users/${member.id}/reactivate`)
        .set('Cookie', mod.cookie)
        .send({});
      expect(reactivate.status).toBe(200);
      expect(reactivate.body.status).toBe('active');
      expect((await auditRows()).length).toBe(2);
    });

    it('annule un événement publié : la ligne est conservée, statut cancelled', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const organizer = await seed({ role: UserRole.Organizer, profileStatus: ProfileStatus.Approved });
      const eventId = await seedEvent(organizer.id);

      const response = await http()
        .post(`/api/moderation/events/${eventId}/cancel`)
        .set('Cookie', mod.cookie)
        .send({ reason: REASON });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
      const event = await db.getRepository(Event).findOneByOrFail({ id: eventId });
      expect(event.status).toBe(EventStatus.Cancelled);
      const rows = await auditRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'cancel_event', target_event_id: eventId, target_user_id: null });
    });
  });

  describe('échec du journal → rollback complet', () => {
    beforeEach(async () => {
      await db.query(`
        CREATE OR REPLACE FUNCTION fail_audit_fn() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'journal indisponible'; END; $$ LANGUAGE plpgsql`);
      await db.query(
        'CREATE TRIGGER fail_audit BEFORE INSERT ON moderation_actions FOR EACH ROW EXECUTE FUNCTION fail_audit_fn()',
      );
    });

    it('un profil approuvé reste pending et rien n’est écrit', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();
      const response = await http()
        .post(`/api/moderation/profiles/${member.id}/approve`)
        .set('Cookie', mod.cookie)
        .send({});
      expect(response.status).toBe(500);
      expect(await profileStatus(member.id)).toBe(ProfileStatus.Pending);
      expect(await auditRows()).toHaveLength(0);
    });

    it('une suspension est annulée : statut et session_version inchangés', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();
      const response = await http()
        .post(`/api/moderation/users/${member.id}/suspend`)
        .set('Cookie', mod.cookie)
        .send({ reason: REASON });
      expect(response.status).toBe(500);
      const user = await db.getRepository(User).findOneByOrFail({ id: member.id });
      expect(user).toMatchObject({ status: AccountStatus.Active, sessionVersion: 0, suspendedAt: null });
    });

    it('une annulation d’événement est annulée : l’événement reste publié', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const organizer = await seed({ role: UserRole.Organizer });
      const eventId = await seedEvent(organizer.id);
      const response = await http()
        .post(`/api/moderation/events/${eventId}/cancel`)
        .set('Cookie', mod.cookie)
        .send({ reason: REASON });
      expect(response.status).toBe(500);
      expect((await db.getRepository(Event).findOneByOrFail({ id: eventId })).status).toBe(
        EventStatus.Published,
      );
    });
  });

  describe('un modérateur ne peut pas cibler un modérateur (ni lui-même)', () => {
    const routes: [string, (id: string) => string, object][] = [
      ['approve', (id) => `/api/moderation/profiles/${id}/approve`, {}],
      ['block', (id) => `/api/moderation/profiles/${id}/block`, { reason: REASON }],
      ['unblock', (id) => `/api/moderation/profiles/${id}/unblock`, {}],
      ['suspend', (id) => `/api/moderation/users/${id}/suspend`, { reason: REASON }],
      ['reactivate', (id) => `/api/moderation/users/${id}/reactivate`, {}],
    ];

    it.each(routes)('%s → 403 CANNOT_MODERATE_MODERATOR, aucune ligne', async (_name, path, body) => {
      const mod = await seed({ role: UserRole.Moderator });
      const other = await seed({ role: UserRole.Moderator });
      for (const target of [other.id, mod.id]) {
        const response = await http().post(path(target)).set('Cookie', mod.cookie).send(body);
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('CANNOT_MODERATE_MODERATOR');
      }
      expect(await auditRows()).toHaveLength(0);
    });

    it('le changement de rôle d’un modérateur est refusé', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const other = await seed({ role: UserRole.Moderator });
      const response = await http()
        .put(`/api/moderation/users/${other.id}/role`)
        .set('Cookie', mod.cookie)
        .send({ role: 'member' });
      expect(response.status).toBe(403);
      expect(await auditRows()).toHaveLength(0);
    });

    it('annuler l’événement d’un modérateur est refusé', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const other = await seed({ role: UserRole.Moderator });
      const eventId = await seedEvent(other.id);
      const response = await http()
        .post(`/api/moderation/events/${eventId}/cancel`)
        .set('Cookie', mod.cookie)
        .send({ reason: REASON });
      expect(response.status).toBe(403);
      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('autorisation relue en base', () => {
    it('un membre et un organisateur reçoivent 403 ROLE_REQUIRED', async () => {
      const member = await seed({ profileStatus: ProfileStatus.Approved });
      const organizer = await seed({ role: UserRole.Organizer, profileStatus: ProfileStatus.Approved });
      const target = await seed();
      for (const actor of [member, organizer]) {
        const read = await http().get('/api/moderation/profiles').set('Cookie', actor.cookie);
        const write = await http()
          .post(`/api/moderation/profiles/${target.id}/approve`)
          .set('Cookie', actor.cookie)
          .send({});
        expect([read.status, write.status]).toEqual([403, 403]);
        expect(write.body.code).toBe('ROLE_REQUIRED');
      }
      expect(await profileStatus(target.id)).toBe(ProfileStatus.Pending);
      expect(await auditRows()).toHaveLength(0);
    });

    it('un anonyme reçoit 401', async () => {
      const response = await http().get('/api/moderation/profiles');
      expect(response.status).toBe(401);
    });

    it('un modérateur rétrogradé garde son jeton mais perd l’accès', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const target = await seed();
      await db.getRepository(User).update({ id: mod.id }, { role: UserRole.Member });
      const response = await http()
        .post(`/api/moderation/profiles/${target.id}/approve`)
        .set('Cookie', mod.cookie)
        .send({});
      expect(response.status).toBe(403);
      expect(await auditRows()).toHaveLength(0);
    });

    it('un modérateur suspendu est refusé', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const target = await seed();
      await db.getRepository(User).update(
        { id: mod.id },
        { status: AccountStatus.Suspended, suspendedAt: new Date() },
      );
      const response = await http()
        .post(`/api/moderation/profiles/${target.id}/approve`)
        .set('Cookie', mod.cookie)
        .send({});
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('ACCOUNT_SUSPENDED');
      expect(await auditRows()).toHaveLength(0);
    });
  });

  describe('transitions invalides et validation', () => {
    it('refuse avec 409 sans écrire de journal', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const pending = await seed();
      const suspended = await seed({ accountStatus: AccountStatus.Suspended });
      const cancelledEvent = await seedEvent((await seed({ role: UserRole.Organizer })).id, EventStatus.Cancelled);

      const attempts: [string, object][] = [
        [`/api/moderation/profiles/${pending.id}/unblock`, {}],
        [`/api/moderation/users/${suspended.id}/suspend`, { reason: REASON }],
        [`/api/moderation/users/${pending.id}/reactivate`, {}],
        [`/api/moderation/events/${cancelledEvent}/cancel`, { reason: REASON }],
      ];
      for (const [path, body] of attempts) {
        const response = await http().post(path).set('Cookie', mod.cookie).send(body);
        expect(response.status).toBe(409);
      }
      expect(await auditRows()).toHaveLength(0);
    });

    it('exige un motif pour bloquer, suspendre et annuler (400)', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();
      const eventId = await seedEvent(member.id);
      for (const path of [
        `/api/moderation/profiles/${member.id}/block`,
        `/api/moderation/users/${member.id}/suspend`,
        `/api/moderation/events/${eventId}/cancel`,
      ]) {
        const response = await http().post(path).set('Cookie', mod.cookie).send({});
        expect(response.status).toBe(400);
      }
      expect(await auditRows()).toHaveLength(0);
    });

    it('renvoie 404 pour une cible inconnue et 400 pour un identifiant mal formé', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const unknown = await http()
        .post('/api/moderation/profiles/11111111-1111-4111-8111-111111111111/approve')
        .set('Cookie', mod.cookie)
        .send({});
      expect(unknown.status).toBe(404);
      const malformed = await http()
        .post('/api/moderation/profiles/pas-un-uuid/approve')
        .set('Cookie', mod.cookie)
        .send({});
      expect(malformed.status).toBe(400);
    });

    it('refuse d’approuver un profil incomplet (409 PROFILE_INCOMPLETE)', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();
      await db.getRepository(ProfileInterest).delete({ profileId: member.id });
      const response = await http()
        .post(`/api/moderation/profiles/${member.id}/approve`)
        .set('Cookie', mod.cookie)
        .send({});
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PROFILE_INCOMPLETE');
    });
  });

  describe('journal en ajout seul et confidentialité de la messagerie', () => {
    it('n’expose aucune route d’écriture sur le journal', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      for (const method of ['put', 'patch', 'delete', 'post'] as const) {
        const response = await http()[method]('/api/moderation/actions').set('Cookie', mod.cookie).send({});
        expect(response.status).toBe(404);
      }
    });

    it('un modérateur ne voit que sa boîte vide et aucune route de modération de la messagerie', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const id = '11111111-1111-4111-8111-111111111111';
      const inbox = await http().get('/api/conversations').set('Cookie', mod.cookie);
      expect(inbox.status).toBe(200);
      expect(inbox.body).toEqual([]);
      for (const path of [
        `/api/conversations/${id}`,
        `/api/conversations/${id}/messages`,
        '/api/moderation/conversations',
        `/api/moderation/conversations/${id}/messages`,
        '/api/moderation/messages',
      ]) {
        const response = await http().get(path).set('Cookie', mod.cookie);
        expect(response.status).toBe(404);
        if (path.startsWith('/api/conversations/')) {
          expect(response.body.code).toBe('CONVERSATION_NOT_FOUND');
        }
      }
    });

    it('les réponses de modération ne contiennent aucune donnée de messagerie', async () => {
      const mod = await seed({ role: UserRole.Moderator });
      const member = await seed();
      const other = await seed();
      const [a, b] = [member.id, other.id].sort();
      const [conversation] = await db.query(
        'INSERT INTO conversations (participant_a_id, participant_b_id) VALUES ($1, $2) RETURNING id',
        [a, b],
      );
      await db.query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)', [
        conversation.id,
        member.id,
        'CONTENU-PRIVE-SECRET',
      ]);

      const responses = [
        await http().get('/api/moderation/profiles?status=pending').set('Cookie', mod.cookie),
        await http().get('/api/moderation/users').set('Cookie', mod.cookie),
        await http().get('/api/moderation/actions').set('Cookie', mod.cookie),
        await http()
          .post(`/api/moderation/profiles/${member.id}/approve`)
          .set('Cookie', mod.cookie)
          .send({}),
        await http()
          .post(`/api/moderation/users/${member.id}/suspend`)
          .set('Cookie', mod.cookie)
          .send({ reason: REASON }),
      ];
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('CONTENU-PRIVE-SECRET');
      }
    });
  });
});
