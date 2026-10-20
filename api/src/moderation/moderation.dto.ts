import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EventStatus } from '../events/event.entity';
import { ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, UserRole } from '../users/user.entity';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ModerationReasonDto {
  @ApiPropertyOptional({ minLength: 5, maxLength: 500 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}

export class RequiredModerationReasonDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class CancelEventDto {
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @Transform(trimString)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
}

export class ChangeUserRoleDto extends ModerationReasonDto {
  @ApiProperty({ enum: [UserRole.Member, UserRole.Organizer] })
  @IsIn([UserRole.Member, UserRole.Organizer])
  role: UserRole.Member | UserRole.Organizer;
}

export class ModerationProfilesQueryDto {
  @ApiPropertyOptional({ enum: ProfileStatus })
  @IsOptional()
  @IsEnum(ProfileStatus)
  status = ProfileStatus.Pending;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class ModerationUsersQueryDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ maxLength: 254 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class ModerationEventsQueryDto {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class ModerationActionsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
