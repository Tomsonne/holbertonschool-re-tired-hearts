import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;

  @IsString()
  DATABASE_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT: number;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  @MinLength(1)
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED: string = 'true';

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  // Nombre de reverse proxies de confiance devant l'API (0 = aucun).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS: number = 0;
}

// Échoue dès le démarrage en listant les variables manquantes ou invalides,
// sans jamais afficher leur valeur.
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const noms = errors.map((error) => error.property).join(', ');
    throw new Error(`Variables d'environnement manquantes ou invalides : ${noms}. Voir .env.example.`);
  }
  return validated;
}
