import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { AccessGuard } from './access.guard';

describe('AccessGuard', () => {
  const reflector = new Reflector();
  const profiles = { findOneBy: jest.fn() };
  let guard: AccessGuard;
  let user: User;
  let accessLevel: string | undefined;
  let roles: UserRole[];
  const handler = () => undefined;
  class TestController {}

  const context = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    user = Object.assign(new User(), { id: 'user-id', status: AccountStatus.Active, role: UserRole.Member });
    accessLevel = undefined;
    roles = [];
    guard = new AccessGuard(reflector, profiles as unknown as Repository<Profile>);
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
      if (key === 'isPublic') return false;
      if (key === 'accessLevel') return accessLevel;
      if (key === 'roles') return roles;
      return undefined;
    });
  });

  it('autorise une route publique sans exiger de compte', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(profiles.findOneBy).not.toHaveBeenCalled();
  });

  it('refuse un compte suspendu sur un accès actif', async () => {
    user.status = AccountStatus.Suspended;

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SUSPENDED' },
    });
  });

  it('laisse passer un compte suspendu sur le niveau session', async () => {
    user.status = AccountStatus.Suspended;
    accessLevel = 'session';

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('exige un profil approuvé pour l’accès approuvé', async () => {
    accessLevel = 'approved';
    profiles.findOneBy.mockResolvedValue(Object.assign(new Profile(), { status: ProfileStatus.Pending }));

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'PROFILE_NOT_APPROVED' },
    });
  });

  it('signale séparément un profil bloqué', async () => {
    accessLevel = 'approved';
    profiles.findOneBy.mockResolvedValue(Object.assign(new Profile(), { status: ProfileStatus.Blocked }));

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'PROFILE_BLOCKED' },
    });
  });

  it('vérifie le rôle après les statuts de compte et de profil', async () => {
    accessLevel = 'moderator';

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'ROLE_REQUIRED' },
    });
    expect(profiles.findOneBy).not.toHaveBeenCalled();
  });

  it('applique les rôles déclarés par @Roles', async () => {
    roles = [UserRole.Organizer];

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'ROLE_REQUIRED' },
    });
  });
});
