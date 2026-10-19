import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';
import { AuthService } from '../../src/auth/auth.service';
import { PasswordService } from '../../src/auth/password.service';

describe('Issue #2 — hachage des mots de passe et sessions', () => {
  describe('hachage Argon2id', () => {
    it('ne permet de vérifier que le mot de passe d’origine', async () => {
      const service = new PasswordService();
      const password = 'un-mot-de-passe-long-et-unique';
      const hash = await service.hash(password);

      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain(password);
      await expect(service.verify(hash, password)).resolves.toBe(true);
      await expect(service.verify(hash, 'mauvais-mot-de-passe')).resolves.toBe(false);
    });
  });

  describe('création de session', () => {
    const userRepository = { createQueryBuilder: jest.fn(), save: jest.fn() };
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
    const passwordService = { hash: jest.fn(), verify: jest.fn() };
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

    it('ne renvoie ni le mot de passe ni son hash et signe seulement sub + sessionVersion', async () => {
      passwordService.hash.mockResolvedValue('stored-argon-hash');
      managerUserRepository.create.mockImplementation((value) => value);
      managerUserRepository.save.mockResolvedValue(
        Object.assign(new User(), {
          id: 'account-id',
          email: 'membre@example.fr',
          passwordHash: 'stored-argon-hash',
          role: UserRole.Member,
          status: AccountStatus.Active,
          sessionVersion: 0,
        }),
      );
      managerProfileRepository.create.mockImplementation((value) => value);
      managerProfileRepository.save.mockResolvedValue(
        Object.assign(new Profile(), {
          userId: 'account-id',
          displayName: 'Membre',
          status: ProfileStatus.Pending,
        }),
      );
      jwtService.signAsync.mockResolvedValue('jwt-de-session');

      const result = await service.register({
        email: 'membre@example.fr',
        password: 'mon-mot-de-passe-secret',
        displayName: 'Membre',
      });

      expect(passwordService.hash).toHaveBeenCalledWith('mon-mot-de-passe-secret');
      expect(managerUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'stored-argon-hash' }),
      );
      expect(JSON.stringify(result)).not.toContain('mon-mot-de-passe-secret');
      expect(JSON.stringify(result.me)).not.toContain('stored-argon-hash');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'account-id', sessionVersion: 0 },
        { secret: 'test-secret', expiresIn: '2h', algorithm: 'HS256' },
      );
    });

    it('renvoie exactement la même erreur pour un compte inconnu et un mot de passe erroné', async () => {
      const query = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };
      userRepository.createQueryBuilder.mockReturnValue(query);
      query.getOne.mockResolvedValueOnce(null);
      const unknownAccountError = service.login({
        email: 'inconnu@example.fr',
        password: 'mot-de-passe-invalide',
      });

      const user = Object.assign(new User(), { passwordHash: 'stored-hash' });
      query.getOne.mockResolvedValueOnce(user);
      passwordService.verify.mockResolvedValue(false);
      const wrongPasswordError = service.login({
        email: 'membre@example.fr',
        password: 'mot-de-passe-invalide',
      });

      const errors = await Promise.all(
        [unknownAccountError, wrongPasswordError].map((attempt) =>
          attempt.then(
            () => null,
            (error: { response: unknown }) => error.response,
          ),
        ),
      );
      expect(errors[0]).toEqual(errors[1]);
      expect(errors[0]).toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('refuse une connexion suspendue et ne signe pas de jeton', async () => {
      const user = Object.assign(new User(), {
        id: 'account-id',
        passwordHash: 'stored-hash',
        status: AccountStatus.Suspended,
      });
      userRepository.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: 'membre@example.fr', password: 'mot-de-passe-validé' }),
      ).rejects.toMatchObject({ response: { statusCode: 403, code: 'ACCOUNT_SUSPENDED' } });
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});
