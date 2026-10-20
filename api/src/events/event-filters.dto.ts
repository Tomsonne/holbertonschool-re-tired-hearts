import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class EventFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  interestId?: number;

  // La ville fonctionne aussi quand la recherche externe a échoué et que cityCode est NULL.
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  cityName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:[0-9]{5}|2[AB][0-9]{3})$/)
  cityCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:[0-9]{2,3}|2[AB])$/)
  departmentCode?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;
}
