import { CanActivate, ExecutionContext, ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { ACCESS_LEVEL_KEY, IS_PUBLIC_KEY, ROLES_KEY, AccessLevel } from './auth.decorators';
import { AuthenticatedRequest } from './jwt-auth.guard';

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
    if (access !== 'session' && user.status === AccountStatus.Suspended) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu.',
      });
    }

    let profile: Profile | null = null;
    if (access === 'approved' || access === 'organizer') {
      profile = await this.profiles.findOneBy({ userId: user.id });
      if (profile?.status === ProfileStatus.Blocked) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'PROFILE_BLOCKED',
          message: 'Ce profil ne peut pas accéder à cette fonctionnalité.',
        });
      }
      if (profile?.status !== ProfileStatus.Approved) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'PROFILE_NOT_APPROVED',
          message: 'Votre profil doit être approuvé pour accéder à cette fonctionnalité.',
        });
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, metadataTargets) ?? [];
    const levelRole = this.roleForAccess(access);
    if (
      (levelRole !== undefined && user.role !== levelRole) ||
      (requiredRoles.length > 0 && !requiredRoles.includes(user.role))
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ROLE_REQUIRED',
        message: "Vous n'avez pas le rôle requis pour effectuer cette action.",
      });
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
