import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { AccountStatus, User } from '../users/user.entity';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { SessionTokenPayload } from './auth.service';

export type AuthenticatedRequest = Request & { user?: User };

const SESSION_COOKIE = 'rth_session';
const SUSPENDED_ALLOWED_ROUTES = new Set(['GET /api/me', 'POST /api/auth/logout']);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Merci de vous connecter pour continuer.',
      );
    }

    let payload: SessionTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<SessionTokenPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (!this.isJwtError(error)) {
        throw error;
      }
      throw this.sessionExpired();
    }

    if (!this.isSessionPayload(payload)) {
      throw this.sessionExpired();
    }

    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) {
      throw this.sessionExpired();
    }

    const versionMismatch = user.sessionVersion !== payload.sessionVersion;
    const suspendedSessionAccess =
      user.status === AccountStatus.Suspended &&
      SUSPENDED_ALLOWED_ROUTES.has(`${request.method} ${request.path}`);
    if (user.status === AccountStatus.Suspended && !suspendedSessionAccess) {
      throw this.accountSuspended();
    }
    if (versionMismatch && !suspendedSessionAccess) {
      throw this.sessionExpired();
    }

    request.user = user;
    return true;
  }

  private isSessionPayload(value: unknown): value is SessionTokenPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const payload = value as Record<string, unknown>;
    const keys = Object.keys(payload).filter((key) => key !== 'iat' && key !== 'exp');
    return (
      keys.length === 2 &&
      keys.includes('sub') &&
      keys.includes('sessionVersion') &&
      typeof payload.sub === 'string' &&
      Number.isInteger(payload.sessionVersion) &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp)
    );
  }

  private isJwtError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('name' in error)) {
      return false;
    }
    return ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(String(error.name));
  }

  private sessionExpired(): AppException {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      'SESSION_EXPIRED',
      'Votre session a expiré, merci de vous reconnecter.',
    );
  }

  private accountSuspended(): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      'ACCOUNT_SUSPENDED',
      'Ce compte est suspendu.',
    );
  }
}
