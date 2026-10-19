import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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
  @Length(1, 5)
  cityCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 3)
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
