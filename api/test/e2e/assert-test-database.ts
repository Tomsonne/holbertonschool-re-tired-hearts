// Garde-fou des tests e2e : ils vident des tables (TRUNCATE ... CASCADE).
// Sans DATABASE_NAME, la configuration retombe sur la base de développement : on refuse alors de démarrer.
export function assertTestDatabase(env: NodeJS.ProcessEnv): void {
  const name = env.DATABASE_NAME ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Tests e2e refusés : DATABASE_NAME="${name}" ne se termine pas par "_test". ` +
        'Ils vident les tables et ne doivent viser que la base de test (ex. re_tired_hearts_test).',
    );
  }
}
