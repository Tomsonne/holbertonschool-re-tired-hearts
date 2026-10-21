import dataSource from './data-source';

// La commande supprime tout le schéma : deux confirmations évitent toute cible accidentelle.
export function assertDemoResetTarget(environment: NodeJS.ProcessEnv): string {
  const name = environment.DATABASE_NAME;
  if (!name || !/^re_tired_hearts_demo_test(?:_[0-9]+)?$/.test(name) ||
      environment.DEMO_RESET_CONFIRM !== name) {
    throw new Error('Reset refusé : utilisez une base re_tired_hearts_demo_test et DEMO_RESET_CONFIRM=<nom exact>.');
  }
  return name;
}

async function main(): Promise<void> {
  assertDemoResetTarget(process.env);
  await dataSource.initialize();
  try {
    // schema:drop ne supprime pas les fonctions PostgreSQL créées par les migrations.
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await dataSource.runMigrations();
    process.stdout.write('Base de démonstration réinitialisée et migrations appliquées.\n');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Échec du reset.'}\n`);
    process.exitCode = 1;
  });
}
