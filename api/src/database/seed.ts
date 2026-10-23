import { DataSource, EntityManager } from 'typeorm';
import dataSource from './data-source';
import { PasswordService } from '../auth/password.service';
import { Interest } from '../interests/interest.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { LookingFor, Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Event, EVENT_MAX_CAPACITY, EVENT_MIN_CAPACITY, EventStatus } from '../events/event.entity';
import { EventRegistration, RegistrationStatus } from '../events/event-registration.entity';
import { Conversation } from '../messaging/conversation.entity';
import { lockEvent } from '../events/lock-event';

// Identités fictives réservées à la démonstration. Aucun compte réel n'est modifié par ce script.
// Toute la démonstration se passe à Lyon et dans sa métropole (département 69) : les filtres par
// département et par ville renvoient donc des résultats dès le premier écran.
// La localisation reste une saisie manuelle (R-LOC-3) : aucun code INSEE n'est inventé ici, donc
// cityCode est null et locationVerified vaut false partout.
export const DEMO_ACCOUNTS = [
  {
    email: 'moderateur@example.test',
    role: UserRole.Moderator,
    displayName: 'Modération démo',
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69003',
    bio: null,
    lookingFor: [],
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
    postalCode: '69007',
    bio: 'Organisateur de démonstration : marches tranquilles et ateliers cuisine dans Lyon.',
    lookingFor: ['friendship', 'activities'],
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
    postalCode: '69100',
    bio: 'Je marche deux fois par semaine et je ne rate jamais un club de lecture.',
    lookingFor: ['friendship', 'activities'],
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
    postalCode: '69003',
    bio: 'Belote, tarot ou balade sur les quais : tout me va, surtout en petit groupe.',
    lookingFor: ['friendship', 'companionship'],
    interestSlugs: ['marche', 'jeux-de-societe'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'organisateur2@example.test',
    role: UserRole.Organizer,
    displayName: 'Claire B.',
    cityName: 'Villeurbanne',
    departmentCode: '69',
    postalCode: '69100',
    bio: 'Ancienne guide de musée. Je fais découvrir le patrimoine lyonnais sans se presser.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['musees', 'cinema-theatre'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'organisateur3@example.test',
    role: UserRole.Organizer,
    displayName: 'Marcel D.',
    cityName: 'Caluire-et-Cuire',
    departmentCode: '69',
    postalCode: '69300',
    bio: 'Pétanque le samedi, tarot le mercredi. Débutants bienvenus, on explique tout.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['petanque', 'jeux-de-societe'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre3@example.test',
    role: UserRole.Member,
    displayName: 'Hélène M.',
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69006',
    bio: 'Retraitée depuis peu, je veux profiter des musées et reprendre la gym douce.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['musees', 'lecture', 'gym-douce'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre4@example.test',
    role: UserRole.Member,
    displayName: 'Gérard P.',
    cityName: 'Vénissieux',
    departmentCode: '69',
    postalCode: '69200',
    bio: 'Trente ans de pétanque et toujours pas lassé. Je cherche des parties détendues.',
    lookingFor: ['friendship'],
    interestSlugs: ['petanque', 'jeux-de-societe'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre5@example.test',
    role: UserRole.Member,
    displayName: 'Josiane T.',
    cityName: 'Caluire-et-Cuire',
    departmentCode: '69',
    postalCode: '69300',
    bio: 'Jardin partagé et recettes de famille : je troque volontiers boutures et tours de main.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['jardinage', 'cuisine'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre6@example.test',
    role: UserRole.Member,
    displayName: 'André L.',
    cityName: 'Bron',
    departmentCode: '69',
    postalCode: '69500',
    bio: 'Je marche avec mon appareil photo. Les sorties du matin sont mes préférées.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['marche', 'photographie'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre7@example.test',
    role: UserRole.Member,
    displayName: 'Monique R.',
    cityName: 'Tassin-la-Demi-Lune',
    departmentCode: '69',
    postalCode: '69160',
    bio: 'Chorale le jeudi, thé dansant le dimanche. La musique me tient debout.',
    lookingFor: ['friendship', 'companionship'],
    interestSlugs: ['danse', 'musique'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre8@example.test',
    role: UserRole.Member,
    displayName: 'Bernard C.',
    cityName: 'Sainte-Foy-lès-Lyon',
    departmentCode: '69',
    postalCode: '69110',
    bio: 'Abonné de longue date aux salles lyonnaises. J’aime discuter du film après la séance.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['cinema-theatre', 'musees'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre9@example.test',
    role: UserRole.Member,
    displayName: 'Christiane V.',
    cityName: 'Oullins',
    departmentCode: '69',
    postalCode: '69600',
    bio: 'Bénévole deux matins par semaine. J’entretiens mon anglais autour d’un café.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['benevolat', 'langues'],
    discoverable: true,
    allowMessages: true,
  },
  {
    email: 'membre10@example.test',
    role: UserRole.Member,
    displayName: 'Daniel F.',
    cityName: 'Saint-Priest',
    departmentCode: '69',
    postalCode: '69800',
    bio: 'Marcheur régulier, joueur de pétanque occasionnel, râleur seulement sous la pluie.',
    lookingFor: ['friendship'],
    interestSlugs: ['marche', 'petanque'],
    discoverable: true,
    allowMessages: true,
  },
  // Volontairement inscrite à aucune sortie : la page « mes inscriptions » a aussi un état vide.
  {
    email: 'membre11@example.test',
    role: UserRole.Member,
    displayName: 'Simone A.',
    cityName: 'Écully',
    departmentCode: '69',
    postalCode: '69130',
    bio: 'Aquarelle, cartonnage et romans policiers. Mon profil reste visible, j’aime rencontrer.',
    lookingFor: ['friendship', 'activities'],
    interestSlugs: ['arts-creatifs', 'lecture'],
    discoverable: true,
    allowMessages: true,
  },
] as const;

// Identifiants stables : le seed reconnaît uniquement les sorties qu'il a créées. Toutes sont
// futures et publiées, réparties dans Lyon et sa métropole pour que le filtre par ville serve.
// Les adresses exactes restent imaginaires ; seuls les repères publics (areaHint) sont réels.
export const DEMO_EVENTS = [
  {
    id: 'd3000000-0000-4000-8000-000000000001',
    organizerEmail: 'organisateur@example.test',
    title: 'Promenade au parc de la Tête d’Or',
    interestSlug: 'marche',
    daysFromNow: 7,
    durationHours: 2,
    capacity: 3,
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69006',
    areaHint: 'Rendez-vous près de l’entrée du parc, côté boulevard',
    exactAddress: '1 rue Imaginaire, 69006 Lyon',
    attendeeEmails: ['membre1@example.test', 'membre2@example.test'],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000002',
    organizerEmail: 'organisateur@example.test',
    title: 'Atelier cuisine lyonnaise',
    interestSlug: 'cuisine',
    daysFromNow: 12,
    durationHours: 3,
    capacity: 8,
    cityName: 'Villeurbanne',
    departmentCode: '69',
    postalCode: '69100',
    areaHint: 'Salle associative du quartier, arrêt de tramway à deux pas',
    exactAddress: '12 rue Imaginaire, 69100 Villeurbanne',
    attendeeEmails: [
      'membre1@example.test',
      'membre2@example.test',
      'membre3@example.test',
      'membre5@example.test',
    ],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000003',
    organizerEmail: 'organisateur2@example.test',
    title: 'Visite guidée du Vieux Lyon',
    interestSlug: 'musees',
    daysFromNow: 18,
    durationHours: 2,
    capacity: 12,
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69005',
    areaHint: 'Devant la cathédrale Saint-Jean, métro Vieux Lyon',
    exactAddress: '3 place Imaginaire, 69005 Lyon',
    attendeeEmails: [
      'membre3@example.test',
      'membre6@example.test',
      'membre8@example.test',
      'membre9@example.test',
    ],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000004',
    organizerEmail: 'organisateur2@example.test',
    title: 'Après-midi cinéma et discussion',
    interestSlug: 'cinema-theatre',
    daysFromNow: 24,
    durationHours: 3,
    capacity: 10,
    cityName: 'Villeurbanne',
    departmentCode: '69',
    postalCode: '69100',
    areaHint: 'Petite salle de quartier, accessible en fauteuil',
    exactAddress: '7 avenue Imaginaire, 69100 Villeurbanne',
    attendeeEmails: ['membre3@example.test', 'membre7@example.test', 'membre8@example.test'],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000005',
    organizerEmail: 'organisateur3@example.test',
    title: 'Tournoi de pétanque amical',
    interestSlug: 'petanque',
    daysFromNow: 9,
    durationHours: 3,
    capacity: 16,
    cityName: 'Caluire-et-Cuire',
    departmentCode: '69',
    postalCode: '69300',
    areaHint: 'Boulodrome municipal, à l’ombre des platanes',
    exactAddress: '5 chemin Imaginaire, 69300 Caluire-et-Cuire',
    attendeeEmails: [
      'membre2@example.test',
      'membre4@example.test',
      'membre6@example.test',
      'membre10@example.test',
    ],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000006',
    organizerEmail: 'organisateur3@example.test',
    title: 'Après-midi jeux de société',
    interestSlug: 'jeux-de-societe',
    daysFromNow: 15,
    durationHours: 3,
    capacity: 12,
    cityName: 'Caluire-et-Cuire',
    departmentCode: '69',
    postalCode: '69300',
    areaHint: 'Maison des associations, salle du rez-de-chaussée',
    exactAddress: '9 rue Imaginaire, 69300 Caluire-et-Cuire',
    attendeeEmails: ['membre2@example.test', 'membre4@example.test', 'membre5@example.test'],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000007',
    organizerEmail: 'organisateur@example.test',
    title: 'Marche douce au bord du Rhône',
    interestSlug: 'marche',
    daysFromNow: 21,
    durationHours: 2,
    capacity: 14,
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69007',
    areaHint: 'Berges du Rhône, parcours plat avec bancs réguliers',
    exactAddress: '22 quai Imaginaire, 69007 Lyon',
    attendeeEmails: [
      'membre1@example.test',
      'membre3@example.test',
      'membre6@example.test',
      'membre10@example.test',
    ],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000008',
    organizerEmail: 'organisateur2@example.test',
    title: 'Gym douce et taï-chi au parc',
    interestSlug: 'gym-douce',
    daysFromNow: 28,
    durationHours: 1,
    capacity: 10,
    cityName: 'Vénissieux',
    departmentCode: '69',
    postalCode: '69200',
    areaHint: 'Pelouse du parc municipal, repli sous le préau s’il pleut',
    exactAddress: '4 allée Imaginaire, 69200 Vénissieux',
    attendeeEmails: ['membre3@example.test', 'membre5@example.test', 'membre7@example.test'],
  },
  {
    id: 'd3000000-0000-4000-8000-000000000009',
    organizerEmail: 'organisateur3@example.test',
    title: 'Café langues : conversation anglaise',
    interestSlug: 'langues',
    daysFromNow: 33,
    durationHours: 2,
    capacity: 8,
    cityName: 'Lyon',
    departmentCode: '69',
    postalCode: '69002',
    areaHint: 'Café du centre, table réservée au fond',
    exactAddress: '18 rue Imaginaire, 69002 Lyon',
    attendeeEmails: ['membre8@example.test', 'membre9@example.test'],
  },
  {
    id: 'd3000000-0000-4000-8000-00000000000a',
    organizerEmail: 'organisateur@example.test',
    title: 'Atelier jardinage partagé',
    interestSlug: 'jardinage',
    daysFromNow: 40,
    durationHours: 3,
    capacity: 12,
    cityName: 'Bron',
    departmentCode: '69',
    postalCode: '69500',
    areaHint: 'Jardin partagé derrière la médiathèque',
    exactAddress: '30 rue Imaginaire, 69500 Bron',
    attendeeEmails: [
      'membre1@example.test',
      'membre5@example.test',
      'membre6@example.test',
      'membre10@example.test',
    ],
  },
] as const;

// R-MSG-2 : une conversation suppose deux participants distincts rendus éligibles par une sortie
// commune. Chaque paire ci-dessous réunit l'organisateur ou deux inscrits de la sortie citée.
// Aucun message n'est créé : la boîte de réception s'ouvre vide, prête pour la démonstration.
export const DEMO_CONVERSATIONS = [
  {
    participantEmails: ['organisateur@example.test', 'membre1@example.test'],
    contextEventId: DEMO_EVENTS[0].id,
  },
  {
    participantEmails: ['membre1@example.test', 'membre2@example.test'],
    contextEventId: DEMO_EVENTS[0].id,
  },
  {
    participantEmails: ['organisateur2@example.test', 'membre3@example.test'],
    contextEventId: DEMO_EVENTS[2].id,
  },
  {
    participantEmails: ['membre3@example.test', 'membre8@example.test'],
    contextEventId: DEMO_EVENTS[2].id,
  },
  {
    participantEmails: ['organisateur3@example.test', 'membre4@example.test'],
    contextEventId: DEMO_EVENTS[4].id,
  },
  {
    participantEmails: ['membre4@example.test', 'membre10@example.test'],
    contextEventId: DEMO_EVENTS[4].id,
  },
  {
    participantEmails: ['membre8@example.test', 'membre9@example.test'],
    contextEventId: DEMO_EVENTS[8].id,
  },
  {
    participantEmails: ['membre5@example.test', 'membre6@example.test'],
    contextEventId: DEMO_EVENTS[9].id,
  },
] as const;

type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
type DemoEvent = (typeof DEMO_EVENTS)[number];

const EVENT_DESCRIPTION = 'Sortie entièrement fictive pour explorer la démonstration.';

function accountsByEmail(): Map<string, DemoAccount> {
  return new Map(DEMO_ACCOUNTS.map((account) => [account.email, account]));
}

function eventsById(): Map<string, DemoEvent> {
  return new Map(DEMO_EVENTS.map((event) => [event.id, event]));
}

// Les trois tableaux se citent par e-mail et par identifiant : une faute de frappe doit se voir
// ici, avec le nom du coupable, plutôt que plus loin sous la forme d'une contrainte violée.
export function assertDemoDataConsistent(): void {
  const accounts = accountsByEmail();
  const events = eventsById();
  if (accounts.size !== DEMO_ACCOUNTS.length) throw new Error('Données de démonstration : e-mail en double.');
  if (events.size !== DEMO_EVENTS.length) throw new Error('Données de démonstration : identifiant de sortie en double.');

  for (const account of DEMO_ACCOUNTS) {
    if (account.email !== account.email.toLowerCase()) {
      throw new Error(`Données de démonstration : ${account.email} doit être en minuscules.`);
    }
    const length = account.displayName.trim().length;
    if (length < 2 || length > 40) {
      throw new Error(`Données de démonstration : nom affiché hors bornes pour ${account.email}.`);
    }
    if (!/^[0-9]{5}$/.test(account.postalCode)) {
      throw new Error(`Données de démonstration : code postal invalide pour ${account.email}.`);
    }
    if (new Set(account.interestSlugs).size !== account.interestSlugs.length) {
      throw new Error(`Données de démonstration : centre d'intérêt en double pour ${account.email}.`);
    }
  }

  for (const event of DEMO_EVENTS) {
    const organizer = accounts.get(event.organizerEmail);
    if (organizer?.role !== UserRole.Organizer) {
      throw new Error(`Données de démonstration : ${event.organizerEmail} n'organise pas (${event.id}).`);
    }
    if (event.capacity < EVENT_MIN_CAPACITY || event.capacity > EVENT_MAX_CAPACITY) {
      throw new Error(`Données de démonstration : capacité hors bornes pour ${event.id}.`);
    }
    if (event.daysFromNow <= 0 || event.durationHours <= 0) {
      throw new Error(`Données de démonstration : dates invalides pour ${event.id}.`);
    }
    if (!/^[0-9]{5}$/.test(event.postalCode)) {
      throw new Error(`Données de démonstration : code postal invalide pour ${event.id}.`);
    }
    if (new Set(event.attendeeEmails).size !== event.attendeeEmails.length) {
      throw new Error(`Données de démonstration : inscription en double sur ${event.id}.`);
    }
    // R-EVT-3 : la capacité ne compte pas l'organisateur, qui ne s'inscrit jamais à sa sortie.
    if (event.attendeeEmails.length > event.capacity) {
      throw new Error(`Données de démonstration : ${event.id} demande plus d'inscrits que de places.`);
    }
    const attendees: readonly string[] = event.attendeeEmails;
    for (const email of attendees) {
      if (!accounts.has(email)) throw new Error(`Données de démonstration : inscrit inconnu ${email} (${event.id}).`);
      if (email === event.organizerEmail) {
        throw new Error(`Données de démonstration : l'organisateur de ${event.id} ne peut pas s'y inscrire.`);
      }
    }
  }

  const pairs = new Set<string>();
  for (const conversation of DEMO_CONVERSATIONS) {
    const [first, second] = conversation.participantEmails;
    const event = events.get(conversation.contextEventId);
    if (!event) {
      throw new Error(`Données de démonstration : conversation rattachée à une sortie inconnue (${first}).`);
    }
    if (first === second) throw new Error(`Données de démonstration : conversation de ${first} avec lui-même.`);
    const key = [first, second].sort().join('|');
    if (pairs.has(key)) throw new Error(`Données de démonstration : conversation en double entre ${first} et ${second}.`);
    pairs.add(key);
    for (const email of conversation.participantEmails) {
      const account = accounts.get(email);
      if (!account) throw new Error(`Données de démonstration : participant inconnu ${email}.`);
      if (!account.allowMessages) {
        throw new Error(`Données de démonstration : ${email} refuse les messages et ne peut pas converser.`);
      }
      const eligibleEmails: readonly string[] = [event.organizerEmail, ...event.attendeeEmails];
      if (!eligibleEmails.includes(email)) {
        throw new Error(`Données de démonstration : ${email} n'est pas éligible via ${event.id}.`);
      }
    }
  }
}

async function createAccount(
  manager: EntityManager,
  account: DemoAccount,
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
      bio: account.bio,
      lookingFor: [...account.lookingFor] as LookingFor[],
      cityName: account.cityName,
      departmentCode: account.departmentCode,
      postalCode: account.postalCode,
      cityCode: null,
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

function assertDemoPassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new Error('DEMO_PASSWORD doit contenir entre 12 et 128 caractères.');
  }
}

async function seedAccounts(manager: EntityManager, password: string): Promise<string[]> {
  const interests = await manager.find(Interest);
  const interestsBySlug = new Map(interests.map((interest) => [interest.slug, interest.id]));
  const created: string[] = [];
  for (const account of DEMO_ACCOUNTS) {
    if ((await createAccount(manager, account, password, interestsBySlug)) === 'created') {
      created.push(account.email);
    }
  }
  return created;
}

export async function seedDemoAccounts(db: DataSource, password: string): Promise<string[]> {
  assertDemoPassword(password);
  assertDemoDataConsistent();
  return db.transaction(async (manager) => seedAccounts(manager, password));
}

// Un compte de démonstration retouché à la main (renommé, suspendu, profil rejeté) sort du
// périmètre du script : on s'arrête avant d'écrire plutôt que de bâtir un graphe incohérent.
async function assertEligible(manager: EntityManager, users: Map<string, User>, emails: Iterable<string>): Promise<void> {
  const accounts = accountsByEmail();
  for (const email of emails) {
    const user = users.get(email);
    const account = accounts.get(email);
    const profile = user ? await manager.findOneBy(Profile, { userId: user.id }) : null;
    if (!user || !account || user.status !== AccountStatus.Active ||
        profile?.status !== ProfileStatus.Approved || profile.displayName !== account.displayName) {
      throw new Error(`Compte de démonstration non éligible : ${email}. Aucune donnée n'a été modifiée.`);
    }
  }
}

async function isRegistered(manager: EntityManager, eventId: string, userId: string): Promise<boolean> {
  const registration = await manager.findOneBy(EventRegistration, { eventId, userId });
  return registration?.status === RegistrationStatus.Registered;
}

// R-MSG-1 : démarrer une conversation suppose le consentement actuel des deux profils, et non
// celui déclaré dans DEMO_ACCOUNTS. Le réglage se change depuis l'écran de profil : un membre qui
// a fermé ses messages depuis le dernier passage fait sauter sa paire, sans faire échouer le seed.
// Une conversation déjà créée n'est jamais supprimée pour autant (R-MSG-3) ; seul l'envoi est refusé.
async function acceptsMessages(manager: EntityManager, userId: string): Promise<boolean> {
  const profile = await manager.findOneBy(Profile, { userId });
  return profile?.allowMessages === true;
}

async function seedEvent(
  manager: EntityManager,
  definition: DemoEvent,
  organizer: User,
  interestsBySlug: Map<string, number>,
  now: Date,
): Promise<Event> {
  let event = await manager.findOneBy(Event, { id: definition.id });
  if (event) event = await lockEvent(manager, definition.id);
  if (event && (event.organizerId !== organizer.id || event.title !== definition.title)) {
    throw new Error(`Identifiant d'événement de démonstration déjà utilisé : ${definition.id}.`);
  }
  if (event) return event;

  const interestId = interestsBySlug.get(definition.interestSlug);
  if (interestId === undefined) throw new Error(`Centre d'intérêt introuvable : ${definition.interestSlug}.`);
  const startsAt = new Date(now.getTime() + definition.daysFromNow * 86400000);
  return manager.save(manager.create(Event, {
    id: definition.id, organizerId: organizer.id, interestId,
    title: definition.title, description: EVENT_DESCRIPTION,
    startsAt, endsAt: new Date(startsAt.getTime() + definition.durationHours * 3600000),
    cityName: definition.cityName, departmentCode: definition.departmentCode,
    postalCode: definition.postalCode, cityCode: null, locationVerified: false,
    areaHint: definition.areaHint, exactAddress: definition.exactAddress,
    capacity: definition.capacity, status: EventStatus.Published, publishedAt: now,
  }));
}

async function seedDemoGraph(manager: EntityManager): Promise<void> {
  const interests = await manager.find(Interest);
  const interestsBySlug = new Map(interests.map((interest) => [interest.slug, interest.id]));
  const users = new Map<string, User>();
  for (const account of DEMO_ACCOUNTS) {
    users.set(account.email, await manager.findOneByOrFail(User, { email: account.email }));
  }
  const referenced = new Set<string>();
  for (const definition of DEMO_EVENTS) {
    referenced.add(definition.organizerEmail);
    for (const email of definition.attendeeEmails) referenced.add(email);
  }
  for (const conversation of DEMO_CONVERSATIONS) {
    for (const email of conversation.participantEmails) referenced.add(email);
  }
  await assertEligible(manager, users, referenced);

  const now = new Date();
  // Une sortie passée, dépubliée ou modifiée à la main reste intacte, inscriptions comprises.
  const openEventIds = new Set<string>();
  for (const definition of DEMO_EVENTS) {
    const organizer = users.get(definition.organizerEmail)!;
    const event = await seedEvent(manager, definition, organizer, interestsBySlug, now);
    if (event.status !== EventStatus.Published || event.startsAt <= now) continue;
    openEventIds.add(event.id);

    const missing: User[] = [];
    for (const email of definition.attendeeEmails) {
      const attendee = users.get(email)!;
      // Une ligne withdrawn existante n'est jamais réactivée par le seed.
      if (!await manager.findOneBy(EventRegistration, { eventId: event.id, userId: attendee.id })) {
        missing.push(attendee);
      }
    }
    const registeredCount = await manager.countBy(EventRegistration, {
      eventId: event.id, status: RegistrationStatus.Registered,
    });
    if (missing.length > event.capacity - registeredCount) {
      throw new Error(`Sortie de démonstration ${definition.id} : places insuffisantes pour ${missing.length} inscription(s).`);
    }
    for (const attendee of missing) {
      await manager.save(manager.create(EventRegistration, {
        eventId: event.id, userId: attendee.id, status: RegistrationStatus.Registered,
      }));
    }
  }

  const events = eventsById();
  for (const definition of DEMO_CONVERSATIONS) {
    if (!openEventIds.has(definition.contextEventId)) continue;
    const organizerEmail = events.get(definition.contextEventId)!.organizerEmail;
    const participants = definition.participantEmails.map((email) => users.get(email)!);
    const eligible = await Promise.all(definition.participantEmails.map(async (email) => {
      const user = users.get(email)!;
      if (!await acceptsMessages(manager, user.id)) return false;
      return email === organizerEmail || await isRegistered(manager, definition.contextEventId, user.id);
    }));
    if (!eligible.every(Boolean)) continue;
    const [participantAId, participantBId] = participants.map((user) => user.id).sort();
    if (await manager.findOneBy(Conversation, { participantAId, participantBId })) continue;
    await manager.save(manager.create(Conversation, {
      participantAId, participantBId, contextEventId: definition.contextEventId,
    }));
  }
}

// Comptes, profils, sorties, inscriptions et conversations partagent une seule
// transaction : un échec en cours de route — places insuffisantes, identifiant de
// sortie déjà pris — ne laisse derrière lui ni compte ni profil créé au passage.
export async function seedDemoData(db: DataSource, password: string): Promise<string[]> {
  assertDemoPassword(password);
  assertDemoDataConsistent();
  return db.transaction('READ COMMITTED', async (manager) => {
    const created = await seedAccounts(manager, password);
    await seedDemoGraph(manager);
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
    const created = await seedDemoData(dataSource, password);
    // Aucun mot de passe ni hachage dans les journaux.
    // Les sorties et les conversations sont celles que le jeu décrit : une paire devenue
    // inéligible est ignorée, donc ce total ne dit pas combien de lignes ont été créées.
    process.stdout.write(
      `Comptes de démonstration créés : ${created.length}/${DEMO_ACCOUNTS.length}. ` +
      `Jeu décrit : ${DEMO_EVENTS.length} sorties, ${DEMO_CONVERSATIONS.length} conversations.\n`,
    );
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
