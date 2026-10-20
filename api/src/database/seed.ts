import { DataSource, EntityManager } from 'typeorm';
import dataSource from './data-source';
import { PasswordService } from '../auth/password.service';
import { Interest } from '../interests/interest.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';

// Identités fictives réservées à la démonstration. Aucun compte réel n'est modifié par ce script.
export const DEMO_ACCOUNTS = [
  {
    email: 'moderateur@example.test',
    role: UserRole.Moderator,
    displayName: 'Modération démo',
    cityName: 'Lyon',
    departmentCode: '69',
    interestSlugs: ['lecture'],
    discoverable: false,
    allowMessages: false,
  },
  {
    email: 'organisateur@example.test',
    role: UserRole.Organizer,
    displayName: 'Organisateur démo',
    cityName: 'Lyon',
    departmentCode: '69',
    interestSlugs: ['marche', 'cuisine'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre1@example.test',
    role: UserRole.Member,
    displayName: 'Membre démo 1',
    cityName: 'Villeurbanne',
    departmentCode: '69',
    interestSlugs: ['marche', 'lecture'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre2@example.test',
    role: UserRole.Member,
    displayName: 'Membre démo 2',
    cityName: 'Lyon',
    departmentCode: '69',
    interestSlugs: ['marche', 'jeux-de-societe'],
    discoverable: true,
    allowMessages: true,
  },
] as const;

async function createAccount(
  manager: EntityManager,
  account: (typeof DEMO_ACCOUNTS)[number],
  password: string,
  interestsBySlug: Map<string, number>,
): Promise<'created' | 'existing'> {
  const existing = await manager.findOneBy(User, { email: account.email });
  if (existing) {
    // Ne jamais promouvoir un compte préexistant qui aurait utilisé un e-mail de démonstration.
    if (existing.role !== account.role) {
      throw new Error(`Compte ${account.email} déjà présent avec un autre rôle. Réinitialisez la base de démonstration.`);
    }
    return 'existing';
  }

  const passwordHash = await new PasswordService().hash(password);
  const user = await manager.save(
    manager.create(User, {
      email: account.email,
      passwordHash,
      role: account.role,
      status: AccountStatus.Active,
    }),
  );
  await manager.save(
    manager.create(Profile, {
      userId: user.id,
      displayName: account.displayName,
      cityName: account.cityName,
      departmentCode: account.departmentCode,
      locationVerified: false,
      discoverable: account.discoverable,
      allowMessages: account.allowMessages,
      status: ProfileStatus.Approved,
      reviewedAt: new Date(),
    }),
  );

  for (const slug of account.interestSlugs) {
    const interestId = interestsBySlug.get(slug);
    if (interestId === undefined) {
      throw new Error(`Centre d'intérêt de démonstration introuvable : ${slug}. Lancez les migrations.`);
    }
    await manager.insert(ProfileInterest, { profileId: user.id, interestId });
  }
  return 'created';
}

export async function seedDemoAccounts(db: DataSource, password: string): Promise<string[]> {
  if (password.length < 12 || password.length > 128) {
    throw new Error('DEMO_PASSWORD doit contenir entre 12 et 128 caractères.');
  }

  return db.transaction(async (manager) => {
    const interests = await manager.find(Interest);
    const interestsBySlug = new Map(interests.map((interest) => [interest.slug, interest.id]));
    const created: string[] = [];
    for (const account of DEMO_ACCOUNTS) {
      if ((await createAccount(manager, account, password, interestsBySlug)) === 'created') {
        created.push(account.email);
      }
    }
    return created;
  });
}

export function assertDemoSeedAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === 'production' && environment.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Seed de démonstration refusé en production sans ALLOW_DEMO_SEED=true.');
  }
}

async function main(): Promise<void> {
  assertDemoSeedAllowed(process.env);

  await dataSource.initialize();
  try {
    const password = process.env.DEMO_PASSWORD ?? 'ReTiredDemo2026!';
    const created = await seedDemoAccounts(dataSource, password);
    // Aucun mot de passe ni hachage dans les journaux.
    process.stdout.write(`Comptes de démonstration créés : ${created.length}/${DEMO_ACCOUNTS.length}.\n`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Échec du seed.'}\n`);
    process.exitCode = 1;
  });
}
