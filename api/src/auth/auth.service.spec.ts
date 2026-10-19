import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
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

  it('enregistre un hachage, crée un profil en attente et ne renvoie pas le mot de passe', async () => {
    passwordService.hash.mockResolvedValue('argon2id-hash');
    managerUserRepository.create.mockImplementation((value) => value);
    managerUserRepository.save.mockResolvedValue(
      Object.assign(new User(), {
        id: 'user-id',
        email: 'member@example.fr',
        passwordHash: 'argon2id-hash',
        role: UserRole.Member,
        status: AccountStatus.Active,
        sessionVersion: 0,
      }),
    );
    managerProfileRepository.create.mockImplementation((value) => value);
    managerProfileRepository.save.mockResolvedValue(
      Object.assign(new Profile(), {
        userId: 'user-id',
        displayName: 'Member',
        status: ProfileStatus.Pending,
      }),
    );
    jwtService.signAsync.mockResolvedValue('signed-token');

    const result = await service.register({
      email: 'member@example.fr',
      password: 'plain-password-not-returned',
      displayName: 'Member',
    });

    expect(passwordService.hash).toHaveBeenCalledWith('plain-password-not-returned');
    expect(managerUserRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'argon2id-hash', role: UserRole.Member }),
    );
    expect(result.me).toEqual({
      id: 'user-id',
      email: 'member@example.fr',
      role: UserRole.Member,
      accountStatus: AccountStatus.Active,
      profileStatus: ProfileStatus.Pending,
      displayName: 'Member',
    });
    expect(JSON.stringify(result.me)).not.toContain('password');
    expect(result.token).toBe('signed-token');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      { sub: 'user-id', sessionVersion: 0 },
      { secret: 'test-secret', expiresIn: '2h', algorithm: 'HS256' },
    );
  });

  it('renvoie la même erreur si le compte est introuvable', async () => {
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);

    await expect(
      service.login({ email: 'unknown@example.fr', password: 'a-long-password' }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Adresse e-mail ou mot de passe incorrect.',
      },
    });
    expect(passwordService.verify).not.toHaveBeenCalled();
  });

  it('renvoie la même erreur si le mot de passe est faux', async () => {
    const user = Object.assign(new User(), { passwordHash: 'stored-hash' });
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);
    passwordService.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'member@example.fr', password: 'a-long-password' }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Adresse e-mail ou mot de passe incorrect.',
      },
    });
  });

  it('ne crée pas de session de connexion pour un compte suspendu', async () => {
    const user = Object.assign(new User(), {
      id: 'user-id',
      passwordHash: 'stored-hash',
      status: AccountStatus.Suspended,
    });
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
    userRepository.createQueryBuilder.mockReturnValue(query);
    passwordService.verify.mockResolvedValue(true);

    await expect(
      service.login({ email: 'member@example.fr', password: 'a-long-password' }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SUSPENDED' } });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
