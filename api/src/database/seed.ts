import { DataSource, EntityManager } from 'typeorm';
import dataSource from './data-source';
import { PasswordService } from '../auth/password.service';
import { Interest } from '../interests/interest.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Event, EventStatus } from '../events/event.entity';
import { EventRegistration, RegistrationStatus } from '../events/event-registration.entity';
import { Conversation } from '../messaging/conversation.entity';

// Identifiants stables : le seed reconnaît uniquement les événements qu'il a créés.
export const DEMO_EVENTS = [
  { id: 'd3000000-0000-4000-8000-000000000001', title: 'Promenade fictive au parc', interestSlug: 'marche', daysFromNow: 30, capacity: 3 },
  { id: 'd3000000-0000-4000-8000-000000000002', title: 'Atelier cuisine fictif', interestSlug: 'cuisine', daysFromNow: 45, capacity: 4 },
] as const;

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

export async function seedDemoData(db: DataSource, password: string): Promise<string[]> {
  const created = await seedDemoAccounts(db, password);
  await db.transaction(async (manager) => {
    const interests = await manager.find(Interest);
    const interestsBySlug = new Map(interests.map((interest) => [interest.slug, interest.id]));
    const organizer = await manager.findOneByOrFail(User, { email: DEMO_ACCOUNTS[1].email });
    const member1 = await manager.findOneByOrFail(User, { email: DEMO_ACCOUNTS[2].email });
    const member2 = await manager.findOneByOrFail(User, { email: DEMO_ACCOUNTS[3].email });
    for (const [user, definition] of [[organizer, DEMO_ACCOUNTS[1]], [member1, DEMO_ACCOUNTS[2]],
      [member2, DEMO_ACCOUNTS[3]]] as const) {
      const profile = await manager.findOneBy(Profile, { userId: user.id });
      if (user.status !== AccountStatus.Active || profile?.status !== ProfileStatus.Approved ||
          !profile.allowMessages || profile.displayName !== definition.displayName) {
        throw new Error(`Compte de démonstration non éligible : ${user.email}. Aucune donnée n'a été modifiée.`);
      }
    }
    const now = new Date();
    let conversationContextAvailable = false;
    for (const definition of DEMO_EVENTS) {
      let event = await manager.findOneBy(Event, { id: definition.id });
      if (event && (event.organizerId !== organizer.id || event.title !== definition.title)) {
        throw new Error(`Identifiant d'événement de démonstration déjà utilisé : ${definition.id}.`);
      }
      if (!event) {
        const interestId = interestsBySlug.get(definition.interestSlug);
        if (interestId === undefined) throw new Error(`Centre d'intérêt introuvable : ${definition.interestSlug}.`);
        const startsAt = new Date(now.getTime() + definition.daysFromNow * 86400000);
        event = await manager.save(manager.create(Event, {
          id: definition.id, organizerId: organizer.id, interestId,
          title: definition.title,
          description: 'Sortie entièrement fictive pour explorer la démonstration.',
          startsAt, endsAt: new Date(startsAt.getTime() + 7200000),
          cityName: 'Lyon', departmentCode: '69', postalCode: '69000', cityCode: null,
          locationVerified: false, areaHint: 'Lieu fictif de démonstration',
          exactAddress: '1 rue Imaginaire, 69000 Lyon', capacity: definition.capacity,
          status: EventStatus.Published, publishedAt: now,
        }));
      }
      // Une sortie passée ou modifiée reste intacte lors d'un rejeu ultérieur.
      if (event.status !== EventStatus.Published || event.startsAt <= now || event.capacity < 2) continue;
      if (definition.id === DEMO_EVENTS[0].id) conversationContextAvailable = true;
      for (const member of [member1, member2]) {
        if (!await manager.findOneBy(EventRegistration, { eventId: event.id, userId: member.id })) {
          // Les deux membres sont actifs, approuvés et distincts de l'organisateur.
          await manager.save(manager.create(EventRegistration, {
            eventId: event.id, userId: member.id, status: RegistrationStatus.Registered,
          }));
        }
      }
    }
    for (const [first, second] of [[organizer, member1], [member1, member2]] as const) {
      const [participantAId, participantBId] = [first.id, second.id].sort();
      const firstRegistered = first.id === organizer.id ||
        (await manager.findOneBy(EventRegistration, { eventId: DEMO_EVENTS[0].id, userId: first.id }))?.status === RegistrationStatus.Registered;
      const secondRegistered = second.id === organizer.id ||
        (await manager.findOneBy(EventRegistration, { eventId: DEMO_EVENTS[0].id, userId: second.id }))?.status === RegistrationStatus.Registered;
      if (conversationContextAvailable && firstRegistered && secondRegistered &&
          !await manager.findOneBy(Conversation, { participantAId, participantBId })) {
        await manager.save(manager.create(Conversation, {
          participantAId, participantBId, contextEventId: DEMO_EVENTS[0].id,
        }));
      }
    }
  });
  return created;
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
    const created = await seedDemoData(dataSource, password);
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
