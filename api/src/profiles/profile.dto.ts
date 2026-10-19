import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOOKING_FOR_VALUES, LookingFor, ProfileStatus } from './profile.entity';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class LocationInputDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trimmed)
  @IsString()
  @Length(1, 100)
  cityName: string;

  @ApiProperty({ example: '69100' })
  @IsString()
  @Matches(/^[0-9]{5}$/)
  postalCode: string;

  @ApiProperty({ example: '69' })
  @IsString()
  @Matches(/^(?:[0-9]{2}|2[AB]|97[1-6])$/)
  departmentCode: string;

  @ApiPropertyOptional({ nullable: true, example: '69266' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9][0-9AB][0-9]{3}$/)
  cityCode?: string | null;

  @ApiProperty()
  @IsBoolean()
  verified: boolean;
}

// Aucun champ role, status ou email : le ValidationPipe global (forbidNonWhitelisted) les refuse en 400.
export class ProfileInputDto {
  @ApiProperty({ minLength: 2, maxLength: 40 })
  @Transform(trimmed)
  @IsString()
  @Length(2, 40)
  displayName: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @ApiProperty({ enum: LOOKING_FOR_VALUES, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(LOOKING_FOR_VALUES, { each: true })
  lookingFor: LookingFor[];

  @ApiProperty({ type: [Number], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  interestIds: number[];

  @ApiPropertyOptional({ type: LocationInputDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationInputDto)
  location?: LocationInputDto | null;

  @ApiProperty()
  @IsBoolean()
  discoverable: boolean;

  @ApiProperty()
  @IsBoolean()
  allowMessages: boolean;
}

export class OwnProfileDto {
  userId: string;
  displayName: string;
  bio: string | null;
  lookingFor: LookingFor[];
  interests: { id: number; slug: string; label: string }[];
  location: {
    cityName: string;
    departmentCode: string;
    postalCode: string | null;
    cityCode: string | null;
    verified: boolean;
  } | null;
  isOrganizer: boolean;
  acceptsMessages: boolean;
  memberSince: string;
  discoverable: boolean;
  allowMessages: boolean;
  status: ProfileStatus;
  isComplete: boolean;
  missingForApproval: string[];
}
