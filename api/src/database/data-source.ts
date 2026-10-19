import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

// Utilisé par la CLI TypeORM (migrations, schema:drop). Lit api/.env puis le .env de la racine.
config({ path: ['.env', '../.env'] });

export default new DataSource(buildDataSourceOptions(process.env));
