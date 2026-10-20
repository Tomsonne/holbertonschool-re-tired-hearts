import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { AccountStatus, User } from '../users/user.entity';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const jwtService = { verifyAsync: jest.fn() };
  const users = { findOneBy: jest.fn() };
  let guard: JwtAuthGuard;
  let request: { cookies: Record<string, string>; method: string; path: string; user?: User };
  const handler = () => undefined;
  class TestController {}

  const context = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    request = { cookies: {}, method: 'GET', path: '/api/me' };
    guard = new JwtAuthGuard(
      reflector,
      jwtService as never,
      users as unknown as Repository<User>,
    );
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  it('ignore la session sur une route publique', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('refuse une requête protégée sans cookie', async () => {
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('rejette un jeton invalide comme une session expirée', async () => {
    request.cookies.rth_session = 'invalid';
    jwtService.verifyAsync.mockRejectedValue({ name: 'TokenExpiredError' });

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
  });

  it('relit le compte en base et injecte le compte courant', async () => {
    request.cookies.rth_session = 'valid';
    const user = Object.assign(new User(), { id: 'user-id', sessionVersion: 4 });
    jwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      sessionVersion: 4,
      iat: 100,
      exp: 200,
    });
    users.findOneBy.mockResolvedValue(user);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(users.findOneBy).toHaveBeenCalledWith({ id: user.id });
    expect(request.user).toBe(user);
  });

  it('révoque le jeton si session_version a changé', async () => {
    request.cookies.rth_session = 'stale';
    request.path = '/api/me/profile';
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sessionVersion: 3,
      iat: 100,
      exp: 200,
    });
    users.findOneBy.mockResolvedValue(Object.assign(new User(), { sessionVersion: 4 }));

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
  });

  it('ne contourne pas la révocation d’un compte actif sur une route de session', async () => {
    request.cookies.rth_session = 'stale';
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sessionVersion: 0,
      iat: 100,
      exp: 200,
    });
    users.findOneBy.mockResolvedValue(
      Object.assign(new User(), { id: 'user-id', status: AccountStatus.Active, sessionVersion: 1 }),
    );

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { statusCode: 401, code: 'SESSION_EXPIRED' },
    });
  });

  it.each([
    ['GET', '/api/me'],
    ['POST', '/api/auth/logout'],
  ])('autorise un compte suspendu sur %s %s malgré l’incrément de session', async (method, path) => {
    request.cookies.rth_session = 'valid';
    request.method = method;
    request.path = path;
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sessionVersion: 0,
      iat: 100,
      exp: 200,
    });
    users.findOneBy.mockResolvedValue(
      Object.assign(new User(), { id: 'user-id', status: AccountStatus.Suspended, sessionVersion: 1 }),
    );

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it.each([
    ['GET', '/api/events'],
    ['GET', '/api/me/'],
    ['GET', '/api/Me'],
    ['POST', '/api/auth/logout/'],
  ])('refuse un compte suspendu sur %s %s', async (method, path) => {
    request.cookies.rth_session = 'valid';
    request.method = method;
    request.path = path;
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sessionVersion: 0,
      iat: 100,
      exp: 200,
    });
    users.findOneBy.mockResolvedValue(
      Object.assign(new User(), { id: 'user-id', status: AccountStatus.Suspended, sessionVersion: 1 }),
    );

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { statusCode: 403, code: 'ACCOUNT_SUSPENDED' },
    });
  });

  it('rejette les jetons contenant des claims métier ou incomplets', async () => {
    request.cookies.rth_session = 'invalid-payload';
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      sessionVersion: 0,
      role: 'moderator',
      iat: 100,
      exp: 200,
    });

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
  });
});
