import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { User, UserRole } from '../users/user.entity';

export const IS_PUBLIC_KEY = 'isPublic';
export const ACCESS_LEVEL_KEY = 'accessLevel';
export const ROLES_KEY = 'roles';

export type AccessLevel = 'session' | 'active' | 'approved' | 'organizer' | 'moderator';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const RequireAccess = (level: AccessLevel) => SetMetadata(ACCESS_LEVEL_KEY, level);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User | undefined =>
    context.switchToHttp().getRequest<{ user?: User }>().user,
);
