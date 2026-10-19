import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { buildDataSourceOptions } from '../../src/database/typeorm.config';
import { Interest } from '../../src/interests/interest.entity';
import { ProfileInterest } from '../../src/profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

// Tests bout en bout de l'issue #11 : vraie application NestJS, vraie base PostgreSQL migrée.
// Ils nécessitent DATABASE_HOST/PORT/USER/PASSWORD/NAME et vident la table users : à ne lancer
// que sur une base jetable. Les comptes sont créés directement en base et authentifiés par un
// cookie signé, pour ne pas dépendre de la limitation de débit de /auth/login.

type Seeded = { id: string; cookie: string };

describe('Issue #11 — autorisation des comptes et des profils (bout en bout)', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let sequence = 0;

  beforeAll(async () => {
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
    await db?.destroy();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users CASCADE');
  });

  async function seed(
    options: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      profileStatus?: ProfileStatus;
      discoverable?: boolean;
      interestSlugs?: string[];
      displayName?: string;
    } = {},
  ): Promise<Seeded> {
    sequence += 1;
    const suspended = options.accountStatus === AccountStatus.Suspended;
    const user = await db.getRepository(User).save({
      email: `membre${sequence}@example.test`,
      passwordHash: 'pas-un-vrai-hash',
      role: options.role ?? UserRole.Member,
      status: options.accountStatus ?? AccountStatus.Active,
      suspendedAt: suspended ? new Date() : null,
      // Une suspension incrémente session_version (R-STATUS-1) ; le cookie garde l'ancienne version.
      sessionVersion: suspended ? 1 : 0,
    });
    await db.getRepository(Profile).save({
      userId: user.id,
      displayName: options.displayName ?? `Membre ${sequence}`,
      status: options.profileStatus ?? ProfileStatus.Approved,
      discoverable: options.discoverable ?? true,
      cityName: 'Lyon',
      departmentCode: '69',
      postalCode: '69001',
      cityCode: '69123',
    });
    for (const slug of options.interestSlugs ?? []) {
      const interest = await db.getRepository(Interest).findOneByOrFail({ slug });
      await db.getRepository(ProfileInterest).insert({ profileId: user.id, interestId: interest.id });
    }
    return { id: user.id, cookie: await sessionCookie(user.id, 0) };
  }

  async function sessionCookie(userId: string, sessionVersion: number): Promise<string> {
    const token = await jwt.signAsync(
      { sub: userId, sessionVersion },
      { secret: process.env.JWT_SECRET, expiresIn: '2h', algorithm: 'HS256' },
    );
    return `rth_session=${token}`;
  }

  const http = () => request(app.getHttpServer());

  const validProfile = {
    displayName: 'Nom modifié',
    lookingFor: ['friendship'],
    interestIds: [],
    location: { cityName: 'Lyon', postalCode: '69001', departmentCode: '69', verified: false },
    discoverable: true,
    allowMessages: true,
  };

  describe('anonyme sur une route protégée → 401', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const routes: ['get' | 'post' | 'put', string][] = [
      ['get', '/api/me'],
      ['post', '/api/auth/logout'],
      ['get', '/api/me/profile'],
      ['put', '/api/me/profile'],
      ['get', '/api/profiles'],
      ['get', `/api/profiles/${userId}`],
    ];

    it.each(routes)('%s %s sans cookie', async (method, path) => {
      const response = await http()[method](path);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('refuse un cookie falsifié ou signé avec un autre secret', async () => {
      const other = await new JwtService().signAsync(
        { sub: userId, sessionVersion: 0 },
        { secret: 'un-autre-secret-un-autre-secret-xx', expiresIn: '2h' },
      );
      for (const cookie of ['rth_session=n-importe-quoi', `rth_session=${other}`]) {
        const response = await http().get('/api/me').set('Cookie', cookie);
        expect(response.status).toBe(401);
      }
    });

    it('refuse un jeton « alg: none »', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: userId, sessionVersion: 0, iat: 1, exp: 9999999999 }),
      ).toString('base64url');
      const response = await http().get('/api/me').set('Cookie', `rth_session=${header}.${payload}.`);
      expect(response.status).toBe(401);
    });

    it('laisse publiques la santé, les centres d’intérêt et la connexion', async () => {
      expect((await http().get('/api/health')).status).toBe(200);
      expect((await http().get('/api/interests')).status).toBe(200);
      const login = await http()
        .post('/api/auth/login')
        .send({ email: 'inconnu@example.test', password: 'mot-de-passe-long-12' });
      expect(login.status).toBe(401);
      expect(login.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('refuse un jeton valide dont le compte a été supprimé', async () => {
      const ghost = await seed();
      await db.query('DELETE FROM users WHERE id = $1', [ghost.id]);
      const response = await http().get('/api/me').set('Cookie', ghost.cookie);
      expect(response.status).toBe(401);
    });
  });

  describe('un membre ne peut pas modifier le profil d’un autre', () => {
    it('PUT /me/profile ne modifie que le profil de la session', async () => {
      const alice = await seed({ displayName: 'Alice' });
      const bob = await seed({ displayName: 'Bob' });

      const response = await http().put('/api/me/profile').set('Cookie', alice.cookie).send(validProfile);
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(alice.id);

      const profiles = db.getRepository(Profile);
      expect((await profiles.findOneByOrFail({ userId: alice.id })).displayName).toBe('Nom modifié');
      expect((await profiles.findOneByOrFail({ userId: bob.id })).displayName).toBe('Bob');
    });

    it('refuse un identifiant cible dans le corps (userId, id, user_id)', async () => {
      const alice = await seed({ displayName: 'Alice' });
      const bob = await seed({ displayName: 'Bob' });
      for (const field of ['userId', 'id', 'user_id']) {
        const response = await http()
          .put('/api/me/profile')
          .set('Cookie', alice.cookie)
          .send({ ...validProfile, [field]: bob.id });
        expect(response.status).toBe(400);
      }
      expect((await db.getRepository(Profile).findOneByOrFail({ userId: bob.id })).displayName).toBe('Bob');
    });

    it('n’expose aucune route d’écriture sur le profil d’un autre', async () => {
      const alice = await seed();
      const bob = await seed({ displayName: 'Bob' });
      for (const method of ['put', 'patch', 'delete'] as const) {
        const response = await http()[method](`/api/profiles/${bob.id}`).set('Cookie', alice.cookie).send(validProfile);
        expect([404, 405]).toContain(response.status);
      }
      expect((await db.getRepository(Profile).findOneByOrFail({ userId: bob.id })).displayName).toBe('Bob');
    });

    it('GET /me/profile renvoie toujours le profil de la session', async () => {
      const alice = await seed({ displayName: 'Alice' });
      await seed({ displayName: 'Bob' });
      const response = await http().get('/api/me/profile').set('Cookie', alice.cookie);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId: alice.id, displayName: 'Alice' });
    });

    it('un profil bloqué est en lecture seule (403 PROFILE_BLOCKED, rien n’est écrit)', async () => {
      const blocked = await seed({ profileStatus: ProfileStatus.Blocked, displayName: 'Bloqué' });
      expect((await http().get('/api/me/profile').set('Cookie', blocked.cookie)).status).toBe(200);
      const write = await http().put('/api/me/profile').set('Cookie', blocked.cookie).send(validProfile);
      expect(write.status).toBe(403);
      expect(write.body.code).toBe('PROFILE_BLOCKED');
      expect((await db.getRepository(Profile).findOneByOrFail({ userId: blocked.id })).displayName).toBe('Bloqué');
    });
  });

  describe('élévation de privilèges : {"role":"moderator"} → 400, rôle inchangé', () => {
    it('à l’inscription : 400 et aucun compte créé', async () => {
      for (const extra of [{ role: 'moderator' }, { role: 'organizer' }, { status: 'approved' }, { accountStatus: 'active' }]) {
        const response = await http()
          .post('/api/auth/register')
          .send({ email: 'pirate@example.test', password: 'mot-de-passe-long-12', displayName: 'Pirate', ...extra });
        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_FAILED');
      }
      expect(await db.getRepository(User).countBy({ email: 'pirate@example.test' })).toBe(0);
    });

    it('à l’inscription valide : le compte est un membre, avec un profil en attente', async () => {
      const response = await http()
        .post('/api/auth/register')
        .send({ email: 'nouveau@example.test', password: 'mot-de-passe-long-12', displayName: 'Nouveau' });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ role: 'member', profileStatus: 'pending', accountStatus: 'active' });
      const user = await db.getRepository(User).findOneByOrFail({ email: 'nouveau@example.test' });
      expect(user.role).toBe(UserRole.Member);
    });

    it.each([{ role: 'moderator' }, { role: 'organizer' }, { status: 'approved' }, { email: 'autre@example.test' }])(
      'à l’édition du profil avec %j : 400, rôle, statut et e-mail inchangés',
      async (extra) => {
        const member = await seed({ profileStatus: ProfileStatus.Pending });
        const before = await db.getRepository(User).findOneByOrFail({ id: member.id });
        const response = await http()
          .put('/api/me/profile')
          .set('Cookie', member.cookie)
          .send({ ...validProfile, ...extra });
        expect(response.status).toBe(400);

        const after = await db.getRepository(User).findOneByOrFail({ id: member.id });
        expect(after.role).toBe(UserRole.Member);
        expect(after.email).toBe(before.email);
        expect((await db.getRepository(Profile).findOneByOrFail({ userId: member.id })).status).toBe(
          ProfileStatus.Pending,
        );
      },
    );

    it('une édition valide ne change jamais le statut du profil', async () => {
      const member = await seed({ profileStatus: ProfileStatus.Pending });
      const response = await http().put('/api/me/profile').set('Cookie', member.cookie).send(validProfile);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending');
    });

    it('un jeton qui revendique un rôle est rejeté : le rôle vient de la base', async () => {
      const member = await seed();
      const forged = await jwt.signAsync(
        { sub: member.id, sessionVersion: 0, role: 'moderator' },
        { secret: process.env.JWT_SECRET, expiresIn: '2h', algorithm: 'HS256' },
      );
      expect((await http().get('/api/me').set('Cookie', `rth_session=${forged}`)).status).toBe(401);
      const me = await http().get('/api/me').set('Cookie', member.cookie);
      expect(me.body.role).toBe('member');
    });
  });

  describe('découverte : jamais de profil pending, blocked ou non éligible', () => {
    async function scenario() {
      const viewer = await seed({ displayName: 'Visiteur' });
      const visible = await seed({ displayName: 'Visible', interestSlugs: ['marche'] });
      const pending = await seed({ profileStatus: ProfileStatus.Pending, displayName: 'EnAttente' });
      const blocked = await seed({ profileStatus: ProfileStatus.Blocked, displayName: 'Bloque' });
      const hidden = await seed({ discoverable: false, displayName: 'Masque' });
      const suspended = await seed({ accountStatus: AccountStatus.Suspended, displayName: 'Suspendu' });
      return { viewer, visible, pending, blocked, hidden, suspended };
    }

    it('GET /profiles ne liste que le profil approuvé, découvrable, actif, hors visiteur', async () => {
      const s = await scenario();
      const response = await http().get('/api/profiles').set('Cookie', s.viewer.cookie);
      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { userId: string }) => item.userId)).toEqual([s.visible.id]);
      expect(response.body).toMatchObject({ page: 1, total: 1 });
    });

    it('les filtres ne font jamais réapparaître un profil non éligible', async () => {
      const s = await scenario();
      const interest = await db.getRepository(Interest).findOneByOrFail({ slug: 'marche' });
      for (const query of ['?departmentCode=69', `?interestId=${interest.id}`, '?page=2']) {
        const response = await http().get(`/api/profiles${query}`).set('Cookie', s.viewer.cookie);
        expect(response.status).toBe(200);
        const ids = response.body.items.map((item: { userId: string }) => item.userId);
        for (const excluded of [s.pending.id, s.blocked.id, s.hidden.id, s.suspended.id, s.viewer.id]) {
          expect(ids).not.toContain(excluded);
        }
      }
      const byInterest = await http().get(`/api/profiles?interestId=${interest.id}`).set('Cookie', s.viewer.cookie);
      expect(byInterest.body.items.map((item: { userId: string }) => item.userId)).toEqual([s.visible.id]);
    });

    it('un profil qui passe en blocked ou pending disparaît aussitôt de la découverte', async () => {
      const s = await scenario();
      for (const status of [ProfileStatus.Blocked, ProfileStatus.Pending]) {
        await db.getRepository(Profile).update({ userId: s.visible.id }, { status });
        const response = await http().get('/api/profiles').set('Cookie', s.viewer.cookie);
        expect(response.body.items).toEqual([]);
        await db.getRepository(Profile).update({ userId: s.visible.id }, { status: ProfileStatus.Approved });
      }
    });

    it('GET /profiles/:id renvoie le même 404 PROFILE_UNAVAILABLE pour tout cas non autorisé', async () => {
      const s = await scenario();
      const ids = [
        s.pending.id,
        s.blocked.id,
        s.hidden.id,
        s.suspended.id,
        s.viewer.id,
        '00000000-0000-4000-8000-000000000000',
        'pas-un-uuid',
      ];
      const responses = await Promise.all(
        ids.map((id) => http().get(`/api/profiles/${id}`).set('Cookie', s.viewer.cookie)),
      );
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('PROFILE_UNAVAILABLE');
      }
      expect(new Set(responses.map((response) => JSON.stringify(response.body))).size).toBe(1);

      const ok = await http().get(`/api/profiles/${s.visible.id}`).set('Cookie', s.viewer.cookie);
      expect(ok.status).toBe(200);
    });

    it('aucune donnée privée dans les réponses de découverte', async () => {
      const s = await scenario();
      const list = await http().get('/api/profiles').set('Cookie', s.viewer.cookie);
      const one = await http().get(`/api/profiles/${s.visible.id}`).set('Cookie', s.viewer.cookie);
      for (const body of [list.text, one.text]) {
        for (const secret of ['@example.test', '69001', '69123', 'password', 'postalCode', 'cityCode', 'email']) {
          expect(body).not.toContain(secret);
        }
      }
    });

    it('seul un membre approuvé découvre : pending et blocked → 403, suspendu → refusé', async () => {
      const pending = await seed({ profileStatus: ProfileStatus.Pending });
      const blocked = await seed({ profileStatus: ProfileStatus.Blocked });
      const suspended = await seed({ accountStatus: AccountStatus.Suspended });

      const pendingResponse = await http().get('/api/profiles').set('Cookie', pending.cookie);
      expect(pendingResponse.status).toBe(403);
      expect(pendingResponse.body.code).toBe('PROFILE_NOT_APPROVED');

      const blockedResponse = await http().get('/api/profiles').set('Cookie', blocked.cookie);
      expect(blockedResponse.status).toBe(403);
      expect(blockedResponse.body.code).toBe('PROFILE_BLOCKED');

      expect([401, 403]).toContain((await http().get('/api/profiles').set('Cookie', suspended.cookie)).status);
    });
  });

  describe('suspension : seules la lecture du compte et la déconnexion restent permises', () => {
    it('GET /me et POST /auth/logout fonctionnent, tout le reste est refusé', async () => {
      const suspended = await seed({ accountStatus: AccountStatus.Suspended });
      expect((await http().get('/api/me').set('Cookie', suspended.cookie)).status).toBe(200);
      expect((await http().post('/api/auth/logout').set('Cookie', suspended.cookie)).status).toBe(204);
      for (const path of ['/api/me/profile', '/api/profiles']) {
        const response = await http().get(path).set('Cookie', suspended.cookie);
        expect([401, 403]).toContain(response.status);
      }
      const write = await http().put('/api/me/profile').set('Cookie', suspended.cookie).send(validProfile);
      expect([401, 403]).toContain(write.status);
    });
  });
});
