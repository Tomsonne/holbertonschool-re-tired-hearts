import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

describe('Issue #4 — routes inscription, connexion, déconnexion et /me', () => {
  describe('AuthService', () => {
    const userRepository = { createQueryBuilder: jest.fn(), save: jest.fn(), update: jest.fn() };
    const profileRepository = { findOneBy: jest.fn() };
    const managerUserRepository = { create: jest.fn(), save: jest.fn() };
    const managerProfileRepository = { create: jest.fn(), save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: typeof User | typeof Profile) =>
            entity === User ? managerUserRepository : managerProfileRepository,
        }),
      ),
    };
    const passwordService = { hash: jest.fn(), verify: jest.fn(), verifyAgainstDummy: jest.fn() };
    const jwtService = { signAsync: jest.fn() };
    const configService = { getOrThrow: jest.fn(() => 'test-secret') };
    let service: AuthService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new AuthService(
        dataSource as unknown as DataSource,
        userRepository as unknown as Repository<User>,
        profileRepository as unknown as Repository<Profile>,
        passwordService as unknown as PasswordService,
        jwtService as unknown as JwtService,
        configService as unknown as ConfigService,
      );
    });

    it('crée atomiquement un compte member et un profil pending', async () => {
      passwordService.hash.mockResolvedValue('argon2id-hash');
      managerUserRepository.create.mockImplementation((values) => values);
      managerUserRepository.save.mockResolvedValue(
        Object.assign(new User(), {
          id: 'new-user',
          email: 'membre@example.fr',
          passwordHash: 'argon2id-hash',
          role: UserRole.Member,
          status: AccountStatus.Active,
          sessionVersion: 0,
        }),
      );
      managerProfileRepository.create.mockImplementation((values) => values);
      managerProfileRepository.save.mockResolvedValue(
        Object.assign(new Profile(), {
          userId: 'new-user',
          displayName: 'Membre',
          status: ProfileStatus.Pending,
        }),
      );
      jwtService.signAsync.mockResolvedValue('signed-session');

      const result = await service.register({
        email: 'membre@example.fr',
        password: 'mot-de-passe-de-test',
        displayName: 'Membre',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(managerUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.Member, passwordHash: 'argon2id-hash' }),
      );
      expect(managerProfileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'new-user', status: ProfileStatus.Pending }),
      );
      expect(result.me).toMatchObject({
        id: 'new-user',
        role: UserRole.Member,
        profileStatus: ProfileStatus.Pending,
      });
      expect(JSON.stringify(result.me)).not.toContain('password');
    });

    it('convertit le doublon d’e-mail en 409 EMAIL_ALREADY_USED', async () => {
      passwordService.hash.mockResolvedValue('argon2id-hash');
      const driverError = Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'uq_users_email',
      });
      dataSource.transaction.mockRejectedValue(
        new QueryFailedError('INSERT INTO users', [], driverError),
      );

      await expect(
        service.register({
          email: 'deja-utilise@example.fr',
          password: 'mot-de-passe-de-test',
          displayName: 'Membre',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: {
          statusCode: HttpStatus.CONFLICT,
          code: 'EMAIL_ALREADY_USED',
        },
      });
    });

    it('renvoie le même 401 INVALID_CREDENTIALS pour un e-mail inconnu et un mauvais mot de passe', async () => {
      const query = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };
      userRepository.createQueryBuilder.mockReturnValue(query);
      query.getOne.mockResolvedValueOnce(null);
      const unknownEmail = service.login({
        email: 'inconnu@example.fr',
        password: 'mot-de-passe-incorrect',
      });

      query.getOne.mockResolvedValueOnce(Object.assign(new User(), { passwordHash: 'stored-hash' }));
      passwordService.verify.mockResolvedValue(false);
      const incorrectPassword = service.login({
        email: 'membre@example.fr',
        password: 'mot-de-passe-incorrect',
      });

      const responses = await Promise.all(
        [unknownEmail, incorrectPassword].map((attempt) =>
          attempt.then(
            () => null,
            (error: { response: unknown }) => error.response,
          ),
        ),
      );

      expect(responses[0]).toEqual(responses[1]);
      expect(responses[0]).toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });
  });

  describe('AuthController', () => {
    const authService = { register: jest.fn(), login: jest.fn(), getMe: jest.fn() };
    const configService = { get: jest.fn() };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    let controller: AuthController;

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );
      configService.get.mockReturnValue('test');
    });

    it('publie les routes de compte attendues avec les statuts HTTP contractuels', () => {
      const route = (method: keyof AuthController) =>
        Reflect.getMetadata('path', AuthController.prototype[method] as object);
      const requestMethod = (method: keyof AuthController) =>
        Reflect.getMetadata('method', AuthController.prototype[method] as object);

      expect(route('register')).toBe('auth/register');
      expect(requestMethod('register')).toBe(RequestMethod.POST);
      expect(route('login')).toBe('auth/login');
      expect(requestMethod('login')).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.login)).toBe(200);
      expect(route('logout')).toBe('auth/logout');
      expect(requestMethod('logout')).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.logout)).toBe(
        HttpStatus.NO_CONTENT,
      );
      expect(route('getMe')).toBe('me');
      expect(requestMethod('getMe')).toBe(RequestMethod.GET);
    });

    it('renvoie la représentation Me et pose le cookie de session sans exposer le jeton', async () => {
      const me = {
        id: 'new-user',
        email: 'membre@example.fr',
        role: UserRole.Member,
        profileStatus: ProfileStatus.Pending,
      };
      authService.register.mockResolvedValue({ me, token: 'signed-session' });

      await expect(
        controller.register(
          { email: 'membre@example.fr', password: 'mot-de-passe-de-test', displayName: 'Membre' },
          response as never,
        ),
      ).resolves.toBe(me);

      expect(response.cookie).toHaveBeenCalledWith(
        'rth_session',
        'signed-session',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          maxAge: 7_200_000,
          path: '/api',
        }),
      );
    });

    it('efface le cookie de façon idempotente à chaque appel de déconnexion', () => {
      controller.logout(response as never);
      controller.logout(response as never);

      expect(response.clearCookie).toHaveBeenCalledTimes(2);
      expect(response.clearCookie).toHaveBeenLastCalledWith(
        'rth_session',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api' }),
      );
    });

    it('retourne le compte associé à la session pour GET /api/me', async () => {
      const user = Object.assign(new User(), { id: 'session-user' });
      const me = { id: user.id, email: 'membre@example.fr' };
      authService.getMe.mockResolvedValue(me);

      await expect(controller.getMe(user)).resolves.toBe(me);
      expect(authService.getMe).toHaveBeenCalledWith(user);
    });
  });
});
