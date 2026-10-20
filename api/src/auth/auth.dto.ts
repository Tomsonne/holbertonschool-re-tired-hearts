import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { AccountStatus, UserRole } from '../users/user.entity';
import { ProfileStatus } from '../profiles/profile.entity';

export class RegisterDto {
  @ApiProperty({ example: 'membre@example.fr' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @ApiProperty({ minLength: 2, maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 40)
  displayName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'membre@example.fr' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class MeDto {
  id: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  profileStatus: ProfileStatus;
  displayName: string;
}
