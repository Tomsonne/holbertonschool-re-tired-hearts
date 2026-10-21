import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import express from 'express';
import request from 'supertest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource, Repository } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';
import { DiscoveryController } from '../../src/profiles/discovery.controller';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

describe('Revue OWASP — correctifs des constats 1 à 3', () => {
  function appWith(): { app: unknown; expressApp: express.Express } {
    const expressApp = express();
    const app = {
      setGlobalPrefix: jest.fn(),
      use: (...handlers: express.RequestHandler[]) => expressApp.use(...handlers),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      getHttpAdapter: () => ({ getInstance: () => expressApp }),
    };
    return { app, expressApp };
  }

  describe('constat 1 : temps de réponse de la connexion', () => {
    const userQuery = { addSelect: jest.fn(), where: jest.fn(), getOne: jest.fn() };
    userQuery.addSelect.mockReturnValue(userQuery);
    userQuery.where.mockReturnValue(userQuery);
    const users = { createQueryBuilder: jest.fn(() => userQuery), update: jest.fn() };
    const profiles = { findOneBy: jest.fn() };
    const passwords = { hash: jest.fn(), verify: jest.fn(), verifyAgainstDummy: jest.fn() };
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    const config = { getOrThrow: jest.fn(() => 'secret') };
    let service: AuthService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new AuthService(
        {} as DataSource,
        users as unknown as Repository<User>,
        profiles as unknown as Repository<Profile>,
        passwords as unknown as PasswordService,
        jwt as unknown as JwtService,
        config as unknown as ConfigService,
      );
    });

    it('vérifie un hash factice quand le compte est inconnu', async () => {
      userQuery.getOne.mockResolvedValue(null);
      await expect(service.login({ email: 'x@example.fr', password: 'mot-de-passe-12345' })).rejects.toMatchObject({
        status: 401,
      });
      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith('mot-de-passe-12345');
      expect(passwords.verify).not.toHaveBeenCalled();
    });

    it('ne vérifie pas de hash factice quand le compte existe', async () => {
      userQuery.getOne.mockResolvedValue(Object.assign(new User(), { id: 'u', passwordHash: 'h' }));
      passwords.verify.mockResolvedValue(false);
      await expect(service.login({ email: 'x@example.fr', password: 'mot-de-passe-12345' })).rejects.toMatchObject({
        status: 401,
      });
      expect(passwords.verifyAgainstDummy).not.toHaveBeenCalled();
    });

    it('PasswordService.verifyAgainstDummy ne lève pas et ne valide aucun mot de passe', async () => {
      await expect(new PasswordService().verifyAgainstDummy('mot-de-passe-12345')).resolves.toBeUndefined();
    });
  });

  describe('constat 2 : limitation de débit', () => {
    const limitOf = (handler: object): number | undefined => Reflect.getMetadata('THROTTLER:LIMITdefault', handler);
    const ttlOf = (handler: object): number | undefined => Reflect.getMetadata('THROTTLER:TTLdefault', handler);
    const guardsOf = (handler: object): unknown[] => Reflect.getMetadata('__guards__', handler) ?? [];

    it('limite l’inscription et la connexion', () => {
      expect(limitOf(AuthController.prototype.register)).toBe(10);
      expect(ttlOf(AuthController.prototype.register)).toBe(3_600_000);
      expect(guardsOf(AuthController.prototype.register)).toContain(ThrottlerGuard);
      expect(limitOf(AuthController.prototype.login)).toBe(5);
      expect(ttlOf(AuthController.prototype.login)).toBe(900_000);
      expect(guardsOf(AuthController.prototype.login)).toContain(ThrottlerGuard);
    });

    it('limite la découverte des profils', () => {
      expect(limitOf(DiscoveryController)).toBe(60);
    });
  });

  describe('constat 2 bis : confiance envers le proxy', () => {
    function clientIp(expressApp: express.Express, forwardedFor: string, socketIp: string): string {
      const request = Object.assign(Object.create(expressApp.request), {
        headers: { 'x-forwarded-for': forwardedFor },
        app: expressApp,
        socket: { remoteAddress: socketIp },
        connection: { remoteAddress: socketIp },
      });
      return request.ip;
    }

    it('avec 1 proxy de confiance, l’IP est celle ajoutée par nginx, pas celle falsifiée par le client', () => {
      const { app, expressApp } = appWith();
      configureApp(app as unknown as INestApplication, { swagger: false, trustProxyHops: 1 });
      expect(clientIp(expressApp, '6.6.6.6, 203.0.113.9', '172.18.0.5')).toBe('203.0.113.9');
      expect(clientIp(expressApp, '203.0.113.10', '172.18.0.5')).toBe('203.0.113.10');
    });

    it('sans proxy de confiance, l’en-tête X-Forwarded-For est ignoré', () => {
      const { app, expressApp } = appWith();
      configureApp(app as unknown as INestApplication, { swagger: false });
      expect(clientIp(expressApp, '6.6.6.6', '198.51.100.7')).toBe('198.51.100.7');
    });
  });

  describe('constat 2 ter : en-têtes de sécurité', () => {
    it('configure Helmet et envoie ses en-têtes sur les réponses', async () => {
      const { app, expressApp } = appWith();
      configureApp(app as unknown as INestApplication, { swagger: false });
      expressApp.get('/probe', (_request, response) => response.sendStatus(204));

      const response = await request(expressApp).get('/probe');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });

  describe('constat 3 : mise à jour ciblée à la connexion', () => {
    it('n’écrit que last_login_at avec update, jamais save de l’entité', async () => {
      const userQuery = { addSelect: jest.fn(), where: jest.fn(), getOne: jest.fn() };
      userQuery.addSelect.mockReturnValue(userQuery);
      userQuery.where.mockReturnValue(userQuery);
      const user = Object.assign(new User(), {
        id: 'u1',
        passwordHash: 'h',
        role: UserRole.Member,
        status: AccountStatus.Active,
        sessionVersion: 0,
        email: 'a@example.fr',
      });
      userQuery.getOne.mockResolvedValue(user);
      const users = { createQueryBuilder: () => userQuery, update: jest.fn(), save: jest.fn() };
      const profiles = {
        findOneBy: jest.fn().mockResolvedValue(
          Object.assign(new Profile(), { status: ProfileStatus.Pending, displayName: 'A' }),
        ),
      };
      const service = new AuthService(
        {} as DataSource,
        users as unknown as Repository<User>,
        profiles as unknown as Repository<Profile>,
        { verify: jest.fn().mockResolvedValue(true) } as unknown as PasswordService,
        { signAsync: jest.fn().mockResolvedValue('t') } as unknown as JwtService,
        { getOrThrow: () => 's' } as unknown as ConfigService,
      );
      await service.login({ email: 'a@example.fr', password: 'mot-de-passe-12345' });
      expect(users.update).toHaveBeenCalledWith({ id: 'u1' }, { lastLoginAt: expect.any(Date) });
      expect(users.save).not.toHaveBeenCalled();
    });
  });
});
