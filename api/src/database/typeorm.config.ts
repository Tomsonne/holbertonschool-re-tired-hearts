import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

// Partagé par l'application NestJS, la CLI TypeORM et les tests : les trois utilisent
// toujours les mêmes entités, les mêmes migrations et les mêmes réglages.
export function buildDataSourceOptions(env: NodeJS.ProcessEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DATABASE_HOST ?? 'localhost',
    port: Number(env.DATABASE_PORT ?? 5442),
    username: env.DATABASE_USER ?? 'rth',
    password: env.DATABASE_PASSWORD ?? '',
    database: env.DATABASE_NAME ?? 're_tired_hearts',
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    // Le schéma ne change que par des migrations relues en pull request.
    synchronize: false,
    uuidExtension: 'pgcrypto',
    logging: env.DATABASE_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
