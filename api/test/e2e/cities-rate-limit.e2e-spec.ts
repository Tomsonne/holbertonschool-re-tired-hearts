import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import {
  CITY_SEARCH_LIMIT,
  CITY_SEARCH_WINDOW_MS,
} from '../../src/cities/cities.controller';
import { buildDataSourceOptions } from '../../src/database/typeorm.config';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { assertTestDatabase } from './assert-test-database';

// La suite vide users : uniquement sur la base PostgreSQL jetable *_test.
// Le fournisseur n'est jamais appelé pour de vrai : global.fetch est remplacé, ce qui
// permet aussi de compter les appels qui lui parviennent.
describe('Quota de recherche de communes (bout en bout)', () => {
  let app: INestApplication;
  let db: DataSource;
  let jwt: JwtService;
  let sequence = 0;
  let provider: jest.Mock;
  let round = 0;
  const originalFetch = global.fetch;
  const http = () => request(app.getHttpServer());

  async function member(): Promise<string> {
    sequence += 1;
    const account = await db.getRepository(User).save({
      email: `communes${sequence}@example.test`, passwordHash: 'integration-test-only',
      role: UserRole.Member, status: AccountStatus.Active, sessionVersion: 0,
    });
    await db.getRepository(Profile).save({
      userId: account.id, displayName: `Membre ${sequence}`,
      cityName: 'Lyon', departmentCode: '69', status: ProfileStatus.Approved,
    });
    const token = await jwt.signAsync(
      { sub: account.id, sessionVersion: 0 },
      { secret: process.env.JWT_SECRET, expiresIn: '2h', algorithm: 'HS256' },
    );
    return `rth_session=${token}`;
  }

  const search = (cookie: string, query: string) =>
    http().get(`/api/cities?q=${encodeURIComponent(query)}`).set('Cookie', cookie);

  // Le cache du service est un singleton partagé par toute la suite : chaque test forge
  // ses propres termes pour que le compteur d'appels au fournisseur reste interprétable.
  const term = (suffix: string | number) => `commune-${round}-${suffix}`;

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
    global.fetch = originalFetch;
    await app?.close();
    if (db?.isInitialized) await db.destroy();
  });

  // Chaque test repart de comptes neufs : le compteur est indexé sur l'identifiant du
  // compte, donc aucun quota ne traîne d'un test à l'autre.
  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users CASCADE');
    round += 1;
    provider = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ nom: 'Lyon', code: '69123', codeDepartement: '69', codesPostaux: ['69001'] }],
    });
    global.fetch = provider as unknown as typeof fetch;
  });

  it('annonce la limite, refuse l’appel suivant et n’atteint plus le fournisseur', async () => {
    expect(CITY_SEARCH_LIMIT).toBe(30);
    expect(CITY_SEARCH_WINDOW_MS).toBe(10_000);
    const cookie = await member();

    // Des termes tous différents : le cache ne sert aucun de ces appels.
    for (let index = 1; index <= CITY_SEARCH_LIMIT; index += 1) {
      const response = await search(cookie, term(index));
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe(String(CITY_SEARCH_LIMIT));
      expect(response.headers['x-ratelimit-remaining']).toBe(String(CITY_SEARCH_LIMIT - index));
    }
    expect(provider).toHaveBeenCalledTimes(CITY_SEARCH_LIMIT);

    const refused = await search(cookie, term('de-trop'));
    expect(refused.status).toBe(429);
    expect(refused.body).toEqual({
      statusCode: 429, code: 'TOO_MANY_REQUESTS',
      message: 'Trop de tentatives. Merci de patienter quelques minutes.',
    });
    expect(refused.headers['retry-after']).toBeDefined();
    // L'intérêt du quota : la requête refusée n'est pas partie chez geo.api.gouv.fr.
    expect(provider).toHaveBeenCalledTimes(CITY_SEARCH_LIMIT);
  });

  it('compte par compte et non par adresse, et laisse passer un terme déjà en cache', async () => {
    const [premier, second] = [await member(), await member()];
    for (let index = 1; index <= CITY_SEARCH_LIMIT; index += 1) {
      expect((await search(premier, term(index))).status).toBe(200);
    }
    expect((await search(premier, term('encore'))).status).toBe(429);

    // Même machine, même adresse : le second compte garde son quota entier.
    const other = await search(second, term('partage'));
    expect(other.status).toBe(200);
    expect(other.headers['x-ratelimit-remaining']).toBe(String(CITY_SEARCH_LIMIT - 1));
    expect(provider).toHaveBeenCalledTimes(CITY_SEARCH_LIMIT + 1);

    // Le même terme, désormais en cache : la réponse ne coûte plus d'appel externe, mais
    // consomme quand même une unité de quota. Le cache ne remplace donc pas la limite.
    const again = await search(second, term('partage'));
    expect(again.status).toBe(200);
    expect(again.headers['x-ratelimit-remaining']).toBe(String(CITY_SEARCH_LIMIT - 2));
    expect(provider).toHaveBeenCalledTimes(CITY_SEARCH_LIMIT + 1);
  });
});
