import { Transform, Type } from 'class-transformer';
import { OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

export class EventLocationDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  cityName: string;

  @IsString()
  @Matches(/^\d{5}$/)
  postalCode: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 3)
  departmentCode: string;

  @IsOptional()
  @IsString()
  @Length(5, 5)
  cityCode?: string | null;

  @IsBoolean()
  verified: boolean;
}

export class EventInputDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(5, 120)
  title: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(20, 2000)
  description: string;

  @IsInt()
  @Min(1)
  interestId: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EventLocationDto)
  location: EventLocationDto;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 120)
  areaHint?: string | null;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 200)
  exactAddress: string;

  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;
}

export class UpdateEventDto extends PartialType(OmitType(EventInputDto, ['location'] as const)) {
  @ValidateIf((_object, value) => value !== undefined)
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EventLocationDto)
  location?: EventLocationDto;
}
