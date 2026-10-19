import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IS_PUBLIC_KEY } from './auth.decorators';

describe('AuthController', () => {
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    getMe: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );
  });

  it('pose le cookie de session httpOnly strict valable deux heures sans renvoyer le jeton', async () => {
    const me = { id: 'user-id', email: 'member@example.fr' };
    authService.login.mockResolvedValue({ me, token: 'signed-token' });
    configService.get.mockReturnValue('production');

    await expect(
      controller.login(
        { email: 'member@example.fr', password: 'a-long-password' },
        response as never,
      ),
    ).resolves.toBe(me);

    expect(response.cookie).toHaveBeenCalledWith(
      'rth_session',
      'signed-token',
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/api',
        maxAge: 7_200_000,
      },
    );
  });

  it('efface le cookie avec les mêmes attributs à la déconnexion', () => {
    configService.get.mockReturnValue('development');

    controller.logout(response as never);

    expect(response.clearCookie).toHaveBeenCalledWith('rth_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/api',
    });
  });

  it('déclare inscription et connexion publiques', () => {
    const reflector = new Reflector();

    expect(reflector.get(IS_PUBLIC_KEY, AuthController.prototype.register)).toBe(true);
    expect(reflector.get(IS_PUBLIC_KEY, AuthController.prototype.login)).toBe(true);
  });
});
