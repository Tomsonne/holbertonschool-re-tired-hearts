import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';
import { DiscoveryController } from '../../src/profiles/discovery.controller';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

describe('Revue OWASP — correctifs des constats 1 à 3', () => {
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

    it('limite l’inscription et la connexion', () => {
      expect(limitOf(AuthController.prototype.register)).toBe(10);
      expect(limitOf(AuthController.prototype.login)).toBe(5);
    });

    it('limite la découverte des profils', () => {
      expect(limitOf(DiscoveryController)).toBe(60);
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
