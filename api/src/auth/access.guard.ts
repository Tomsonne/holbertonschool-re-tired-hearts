import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { User, UserRole } from '../users/user.entity';
import { ACCESS_LEVEL_KEY, IS_PUBLIC_KEY, ROLES_KEY, AccessLevel } from './auth.decorators';
import { AuthenticatedRequest } from './jwt-auth.guard';

const PROFILE_BLOCK_READ_ROUTES = new Set([
  'GET /api/me',
  'GET /api/me/profile',
  'POST /api/auth/logout',
]);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadataTargets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, metadataTargets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Merci de vous connecter pour continuer.',
      );
    }

    const access = this.reflector.getAllAndOverride<AccessLevel>(ACCESS_LEVEL_KEY, metadataTargets) ?? 'active';
    const profile = await this.profiles.findOneBy({ userId: user.id });
    const profileReadAllowed = PROFILE_BLOCK_READ_ROUTES.has(`${request.method} ${request.path}`);
    if (profile?.status === ProfileStatus.Blocked && !profileReadAllowed) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'PROFILE_BLOCKED',
        'Ce profil ne peut pas accéder à cette fonctionnalité.',
      );
    }

    if (access === 'approved' || access === 'organizer') {
      if (profile?.status !== ProfileStatus.Approved) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PROFILE_NOT_APPROVED',
          'Votre profil doit être approuvé pour accéder à cette fonctionnalité.',
        );
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, metadataTargets) ?? [];
    const levelRole = this.roleForAccess(access);
    if (
      (levelRole !== undefined && user.role !== levelRole) ||
      (requiredRoles.length > 0 && !requiredRoles.includes(user.role))
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ROLE_REQUIRED',
        "Vous n'avez pas le rôle requis pour effectuer cette action.",
      );
    }
    return true;
  }

  private roleForAccess(access: AccessLevel): UserRole | undefined {
    if (access === 'organizer') {
      return UserRole.Organizer;
    }
    if (access === 'moderator') {
      return UserRole.Moderator;
    }
    return undefined;
  }
}
