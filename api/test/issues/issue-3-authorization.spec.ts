import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { AccessGuard } from '../../src/auth/access.guard';
import {
  ACCESS_LEVEL_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
  AccessLevel,
} from '../../src/auth/auth.decorators';
import { AuthenticatedRequest, JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { Profile, ProfileStatus } from '../../src/profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../../src/users/user.entity';

describe('Issue #3 — gardes et décorateurs d’autorisation', () => {
  const handler = () => undefined;
  class ProtectedController {}

  function makeContext(request: AuthenticatedRequest): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => ProtectedController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  describe('JwtAuthGuard', () => {
    const jwtService = { verifyAsync: jest.fn() };
    const users = { findOneBy: jest.fn() };
    let reflector: Reflector;
    let guard: JwtAuthGuard;
    let request: AuthenticatedRequest;

    beforeEach(() => {
      jest.clearAllMocks();
      request = { cookies: {} } as unknown as AuthenticatedRequest;
      reflector = new Reflector();
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      guard = new JwtAuthGuard(
        reflector,
        jwtService as never,
        users as unknown as Repository<User>,
      );
    });

    it('refuse une route protégée sans cookie de session', async () => {
      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 401, code: 'UNAUTHENTICATED' },
      });
    });

    it('relit le rôle et le statut depuis la base et refuse une session révoquée', async () => {
      request.cookies = { rth_session: 'signed-token' };
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'account-id',
        sessionVersion: 7,
        iat: 100,
        exp: 200,
      });
      users.findOneBy.mockResolvedValue(
        Object.assign(new User(), {
          id: 'account-id',
          sessionVersion: 8,
          role: UserRole.Moderator,
          status: AccountStatus.Active,
        }),
      );

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 401, code: 'SESSION_EXPIRED' },
      });
      expect(users.findOneBy).toHaveBeenCalledWith({ id: 'account-id' });
    });

    it('accepte une session dont la version a changé uniquement sur un accès session d’un compte suspendu', async () => {
      request.cookies = { rth_session: 'signed-token' };
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'account-id',
        sessionVersion: 7,
        iat: 100,
        exp: 200,
      });
      users.findOneBy.mockResolvedValue(
        Object.assign(new User(), {
          id: 'account-id',
          sessionVersion: 8,
          status: AccountStatus.Suspended,
        }),
      );
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
        key === ACCESS_LEVEL_KEY ? 'session' : false,
      );

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.user).toMatchObject({
        id: 'account-id',
        status: AccountStatus.Suspended,
      });
    });

    it('refuse le même jeton suspendu si la route ne porte pas le niveau session', async () => {
      request.cookies = { rth_session: 'signed-token' };
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'account-id',
        sessionVersion: 7,
        iat: 100,
        exp: 200,
      });
      users.findOneBy.mockResolvedValue(
        Object.assign(new User(), {
          id: 'account-id',
          sessionVersion: 8,
          status: AccountStatus.Suspended,
        }),
      );

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 401, code: 'SESSION_EXPIRED' },
      });
    });

    it('n’accepte aucun rôle ni statut métier dans les claims du jeton', async () => {
      request.cookies = { rth_session: 'signed-token' };
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'account-id',
        sessionVersion: 7,
        role: UserRole.Moderator,
        status: AccountStatus.Active,
        iat: 100,
        exp: 200,
      });

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { code: 'SESSION_EXPIRED' },
      });
      expect(users.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('AccessGuard', () => {
    const profiles = { findOneBy: jest.fn() };
    const reflector = new Reflector();
    let guard: AccessGuard;
    let request: AuthenticatedRequest;
    let level: AccessLevel;
    let requiredRoles: UserRole[];

    beforeEach(() => {
      jest.clearAllMocks();
      request = {
        user: Object.assign(new User(), {
          id: 'account-id',
          role: UserRole.Member,
          status: AccountStatus.Active,
        }),
      } as AuthenticatedRequest;
      level = 'active';
      requiredRoles = [];
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ACCESS_LEVEL_KEY) return level;
        if (key === ROLES_KEY) return requiredRoles;
        return undefined;
      });
      guard = new AccessGuard(reflector, profiles as unknown as Repository<Profile>);
    });

    it('refuse un compte suspendu avant de vérifier le profil ou le rôle', async () => {
      request.user!.status = AccountStatus.Suspended;
      level = 'moderator';

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 403, code: 'ACCOUNT_SUSPENDED' },
      });
      expect(profiles.findOneBy).not.toHaveBeenCalled();
    });

    it('autorise un compte suspendu uniquement sur le niveau session', async () => {
      request.user!.status = AccountStatus.Suspended;
      level = 'session';

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(profiles.findOneBy).not.toHaveBeenCalled();
    });

    it.each([
      [ProfileStatus.Pending, 'PROFILE_NOT_APPROVED'],
      [ProfileStatus.Blocked, 'PROFILE_BLOCKED'],
    ])('refuse un profil %s avant le contrôle du rôle', async (status, code) => {
      level = 'approved';
      requiredRoles = [UserRole.Moderator];
      profiles.findOneBy.mockResolvedValue(Object.assign(new Profile(), { status }));

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 403, code },
      });
    });

    it('vérifie le rôle après le compte et le profil approuvés', async () => {
      level = 'approved';
      requiredRoles = [UserRole.Moderator];
      profiles.findOneBy.mockResolvedValue(
        Object.assign(new Profile(), { status: ProfileStatus.Approved }),
      );

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { statusCode: 403, code: 'ROLE_REQUIRED' },
      });
      expect(profiles.findOneBy).toHaveBeenCalledWith({ userId: 'account-id' });
    });

    it('autorise un organisateur approuvé et refuse un rôle différent via @Roles', async () => {
      request.user!.role = UserRole.Organizer;
      level = 'organizer';
      profiles.findOneBy.mockResolvedValue(
        Object.assign(new Profile(), { status: ProfileStatus.Approved }),
      );

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

      requiredRoles = [UserRole.Moderator];
      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        response: { code: 'ROLE_REQUIRED' },
      });
    });
  });
});
