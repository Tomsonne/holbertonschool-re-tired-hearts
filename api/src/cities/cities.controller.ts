import { Controller, Get, Query } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequireAccess } from '../auth/auth.decorators';
import { CitiesService } from './cities.service';

class CitiesQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 100)
  q: string;
}

@Controller('cities')
@RequireAccess('active')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  search(@Query() query: CitiesQueryDto) {
    return this.cities.search(query.q);
  }
}
