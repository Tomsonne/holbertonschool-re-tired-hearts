import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.decorators';
import { AppException } from '../common/app.exception';

class HealthDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';

  @ApiProperty({ example: 'up' })
  database: 'up';
}

// Utilisée par la sonde de santé Docker Compose et par l'interface Vue
// pour détecter une API indisponible.
@ApiTags('système')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: HealthDto, description: "L'API et PostgreSQL répondent" })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL est injoignable' })
  async check(): Promise<HealthDto> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Le service est momentanément indisponible. Merci de réessayer plus tard.',
      );
    }
    return { status: 'ok', database: 'up' };
  }
}
