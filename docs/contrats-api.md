# Contrats d'API

- Base : `/api`, même origine que l'application Vue (proxy Vite en développement, nginx en Docker).
- Format JSON, UTF-8. Les dates sont au format ISO 8601 en UTC.
- Documentation interactive des routes **déjà implémentées** : <http://localhost:3000/api/docs>.
  Ce document est le contrat de tout le MVP ; une route marquée _(tâche 0 ✅)_ est déjà en place.
- Authentification : cookie `rth_session` posé par `POST /api/auth/login` (voir
  [règles métier §9](regles-metier.md#9-sessions-et-mots-de-passe)).

## Niveaux d'accès

| Niveau | Signification |
|---|---|
| **public** | Aucune session nécessaire |
| **session** | Jeton non expiré ; compte suspendu admis uniquement sur `GET /me` et `POST /auth/logout` |
| **actif** | Session valide + compte `active` (le profil peut être en attente) |
| **approuvé** | **actif** + profil `approved` |
| **organisateur** | **approuvé** + rôle `organizer` |
| **modérateur** | **actif** + rôle `moderator` |

Ordre de vérification : authentification → statut du compte → statut du profil → rôle → propriété de
la ressource (dans le service).

La suspension incrémente `session_version`. Un jeton déjà émis reste admis uniquement pour
`GET /api/me` et `POST /api/auth/logout`; il est rejeté sur toute autre route protégée. Une
connexion ultérieure au compte suspendu répond `403 ACCOUNT_SUSPENDED`. Après réactivation,
l'ancienne version du jeton est rejetée.

## Format d'erreur

Toutes les erreurs ont la même forme et ne contiennent **jamais** de trace technique, de SQL ni de
détail interne :

```json
{
  "statusCode": 409,
  "code": "EVENT_FULL",
  "message": "Cette sortie est complète. Vous pouvez chercher une autre date.",
  "details": [{ "field": "capacity", "messages": ["capacity ne peut pas être inférieur à 1"] }]
}
```

`details` n'apparaît que pour `VALIDATION_FAILED`. `message` est rédigé pour l'utilisateur.

| Statut | Codes génériques |
|---|---|
| 400 | `VALIDATION_FAILED` (champs inconnus compris, par exemple `role`) |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `PROFILE_NOT_APPROVED`, `PROFILE_BLOCKED`, `ROLE_REQUIRED` |
| 404 | `NOT_FOUND`, `PROFILE_UNAVAILABLE`, `EVENT_NOT_FOUND`, `CONVERSATION_NOT_FOUND` |
| 409 | Conflits métier (détaillés par route) |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_ERROR` (message générique, détails seulement dans les logs serveur) |
| 503 | `SERVICE_UNAVAILABLE`, `CITY_LOOKUP_UNAVAILABLE` |

## Formes partagées

```ts
type Location = { cityName: string; departmentCode: string };          // visible des membres
type PrivateLocation = Location & { postalCode: string | null; cityCode: string | null; verified: boolean };
type Interest = { id: number; slug: string; label: string };
type MemberSummary = { userId: string; displayName: string; isOrganizer: boolean }; // organisateur de cette sortie
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
```

## Système

| Route | Accès | Réponse | Erreurs |
|---|---|---|---|
| `GET /api/health` _(tâche 0 ✅)_ | public | `200 { status: "ok", database: "up" }` | `503 SERVICE_UNAVAILABLE` si PostgreSQL est injoignable |
| `GET /api/interests` _(tâche 0 ✅)_ | public | `200 Interest[]` trié par libellé | — |

## Comptes et sessions (tâche 1)

| Route | Accès | Corps | Réponse | Erreurs |
|---|---|---|---|---|
| `POST /api/auth/register` | public | `{ email, password, displayName }` | `201 Me` + cookie | `400 VALIDATION_FAILED`, `409 EMAIL_ALREADY_USED`, `429` |
| `POST /api/auth/login` | public | `{ email, password }` | `200 Me` + cookie | `400`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED`, `429` |
| `POST /api/auth/logout` | session | — | `204`, cookie effacé | — (idempotent) |
| `GET /api/me` | session | — | `200 Me` | `401 UNAUTHENTICATED`, `401 SESSION_EXPIRED` |

```ts
type Me = {
  id: string; email: string;
  role: 'member' | 'organizer' | 'moderator';
  accountStatus: 'active' | 'suspended';
  profileStatus: 'pending' | 'approved' | 'blocked';
  displayName: string;
};
```

## Profils (tâche 1)

| Route | Accès | Corps | Réponse | Erreurs |
|---|---|---|---|---|
| `GET /api/me/profile` | actif | — | `200 OwnProfile` | `401` |
| `PUT /api/me/profile` | actif, profil non bloqué | `ProfileInput` | `200 OwnProfile` | `400` (dont `location: null` sur un profil approuvé), `403 PROFILE_BLOCKED` |
| `GET /api/profiles?interestId=&departmentCode=&page=` | approuvé | — | `200 Page<PublicProfile>` | `403 PROFILE_NOT_APPROVED` |
| `GET /api/profiles/:userId` | approuvé | — | `200 PublicProfile` | `404 PROFILE_UNAVAILABLE` (même réponse pour en attente, bloqué, masqué, suspendu, inconnu) |

```ts
type ProfileInput = {            // ni role, ni status, ni email : champ inconnu → 400
  displayName: string;           // 2–40
  bio?: string | null;           // 500 max
  lookingFor: ('friendship' | 'companionship' | 'romance' | 'activities')[];
  interestIds: number[];         // 0–10 (≥ 1 requis pour l'approbation)
  location?: { cityName: string; postalCode: string; departmentCode: string; cityCode?: string | null; verified: boolean } | null;
  discoverable: boolean;
  allowMessages: boolean;
};
type PublicProfile = {           // ce que voient les autres membres
  userId: string; displayName: string; bio: string | null;
  lookingFor: string[]; interests: Interest[]; location: Location;
  isOrganizer: boolean; acceptsMessages: boolean; memberSince: string;   // "2026-10"
};
type OwnProfile = Omit<PublicProfile, 'location'> & {
  location: PrivateLocation | null; discoverable: boolean; allowMessages: boolean;
  status: 'pending' | 'approved' | 'blocked'; isComplete: boolean; missingForApproval: string[];
};
```

## Recherche de communes — API externe (tâche 5)

| Route | Accès | Réponse | Erreurs |
|---|---|---|---|
| `GET /api/cities?q=lyo` | actif | `200 { cityName, postalCodes: string[], departmentCode, cityCode }[]` (8 max) | `400` (`q` < 2 caractères), `503 CITY_LOOKUP_UNAVAILABLE` (délai de 3 s dépassé, erreur ou réponse invalide) → l'interface bascule en saisie manuelle |

## Événements (tâche 2)

| Route | Accès | Corps | Réponse | Erreurs |
|---|---|---|---|---|
| `GET /api/events?interestId=&cityName=&cityCode=&departmentCode=&from=&page=` | actif, profil non bloqué | — | `200 Page<EventSummary>` (publiés, à venir ; ville sans distinction de casse ni d'accents) | `400` (dont codes INSEE ou département invalides) |
| `GET /api/events/:id` | actif, profil non bloqué | — | `200 EventDetail` | `404 EVENT_NOT_FOUND` |
| `POST /api/events` | organisateur | `EventInput` | `201 EventDetail` (statut `draft`) | `400`, `403 ROLE_REQUIRED`, `403 PROFILE_NOT_APPROVED` |
| `PATCH /api/events/:id` | organisateur propriétaire | `Partial<EventInput>` (`location: null` refusé) | `200 EventDetail` | `403 NOT_EVENT_OWNER`, `409 EVENT_NOT_EDITABLE`, `409 CAPACITY_BELOW_REGISTRATIONS`, `409 EVENT_HAS_REGISTRATIONS` (date, lieu ou intérêt modifiés après inscription) |
| `POST /api/events/:id/publish` | organisateur propriétaire | — | `200 EventDetail` | `403`, `409 INVALID_EVENT_TRANSITION`, `409 EVENT_IN_PAST` |
| `POST /api/events/:id/cancel` | organisateur propriétaire | `{ reason }` (5–300) | `200 EventDetail` | `403`, `409 INVALID_EVENT_TRANSITION` |
| `POST /api/events/:id/complete` | organisateur propriétaire | — | `200 EventDetail` | `403`, `409 EVENT_NOT_FINISHED` |
| `DELETE /api/events/:id` | organisateur propriétaire | — | `204` | `403`, `409 EVENT_NOT_DELETABLE` (pas un brouillon, ou a des inscriptions) |
| `GET /api/events/:id/participants` | propriétaire, inscrit, modérateur | — | `200 MemberSummary[]` | `403`, `404` |
| `GET /api/me/organized-events?status=` | organisateur | — | `200 EventSummary[]` (tous statuts) | `403` |

```ts
type EventInput = {
  title: string;               // 5–120
  description: string;         // 20–2000
  interestId: number;
  startsAt: string; endsAt: string;
  location: { cityName: string; postalCode: string; departmentCode: string; cityCode?: string | null; verified: boolean };
  areaHint?: string | null;    // 120 max, repère visible des membres
  exactAddress: string;        // 200 max, inscrits uniquement
  capacity: number;            // 1–50
};
type EventSummary = {
  id: string; title: string; interest: Interest; startsAt: string; endsAt: string;
  location: Location; status: 'draft' | 'published' | 'cancelled' | 'completed';
  isPast: boolean; capacity: number; availablePlaces: number; organizer: MemberSummary;
  myRegistration: 'registered' | 'withdrawn' | null;
};
type EventDetail = EventSummary & {
  description: string; areaHint: string | null;
  exactAddress: string | null;        // null sauf organisateur, inscrit ou modérateur
  cancellationReason: string | null;
  canRegister: boolean; registrationBlockedReason: string | null;
  isOrganizer: boolean;
};
```

## Inscriptions (tâche 2)

| Route | Accès | Réponse | Erreurs |
|---|---|---|---|
| `POST /api/events/:id/registration` | approuvé | `201 { status: 'registered', availablePlaces }` (y compris en réactivant une inscription retirée) | `403 OWN_EVENT`, `404 EVENT_NOT_FOUND` (dont brouillon), `409 ALREADY_REGISTERED`, `409 EVENT_FULL`, `409 EVENT_NOT_OPEN` |
| `DELETE /api/events/:id/registration` | actif, même si le profil n'est plus approuvé | `200 { status: 'withdrawn', availablePlaces }` | `404 NOT_REGISTERED`, `409 EVENT_NOT_OPEN` (déjà commencé) |
| `GET /api/me/registrations?scope=upcoming\|past` | actif | `200 EventSummary[]` | — |

Aucune route ne prend d'identifiant d'inscription : c'est toujours celle de la session.

## Conversations et messages (tâche 3)

| Route | Accès | Corps | Réponse | Erreurs |
|---|---|---|---|---|
| `GET /api/conversations` | approuvé | — | `200 ConversationSummary[]` (activité la plus récente d'abord) | — |
| `POST /api/conversations` | approuvé | `{ recipientId, eventId? }` | `201 Conversation` (nouvelle) ou `200 Conversation` (existante) | `400` (soi-même), `403 NOT_ELIGIBLE`, `404 PROFILE_UNAVAILABLE`, `409 MESSAGING_DISABLED` |
| `GET /api/conversations/:id` | participant | — | `200 Conversation` | `404 CONVERSATION_NOT_FOUND` (aussi pour les non-participants) |
| `GET /api/conversations/:id/messages?before=&limit=` | participant | — | `200 Message[]` du plus ancien au plus récent (50 max) | `404` |
| `POST /api/conversations/:id/messages` | participant approuvé | `{ body }` (1–1000 après nettoyage) | `201 Message` | `400 VALIDATION_FAILED`, `404`, `409 RECIPIENT_UNAVAILABLE`, `409 MESSAGING_DISABLED`, `429` |

```ts
type Conversation = {
  id: string; otherParticipant: MemberSummary & { available: boolean };
  contextEvent: { id: string; title: string } | null;
  canSend: boolean; cannotSendReason: string | null; createdAt: string;
};
type ConversationSummary = Conversation & {
  lastMessage: { body: string; sentByMe: boolean; createdAt: string } | null;
};
type Message = { id: string; body: string; sentByMe: boolean; senderDisplayName: string; createdAt: string };
```

## Modération (tâche 4) — toutes ces routes exigent le rôle **modérateur**

| Route | Corps | Réponse | Erreurs |
|---|---|---|---|
| `GET /api/moderation/profiles?status=pending&page=` | — | `200 Page<ModerationProfile>` | `403 ROLE_REQUIRED` |
| `POST /api/moderation/profiles/:userId/approve` | `{ reason? }` | `200 ModerationProfile` | `404`, `409 INVALID_STATUS_TRANSITION`, `409 PROFILE_INCOMPLETE`, `403 CANNOT_MODERATE_MODERATOR` |
| `POST /api/moderation/profiles/:userId/block` | `{ reason }` | `200` | `404`, `409`, `403` |
| `POST /api/moderation/profiles/:userId/unblock` | `{ reason? }` | `200` | `404`, `409` |
| `GET /api/moderation/users?status=&q=&page=` | — | `200 Page<ModerationUser>` | `403` |
| `POST /api/moderation/users/:userId/suspend` | `{ reason }` | `200 ModerationUser` | `404`, `409`, `403` |
| `POST /api/moderation/users/:userId/reactivate` | `{ reason? }` | `200` | `404`, `409` |
| `PUT /api/moderation/users/:userId/role` | `{ role: 'member' \| 'organizer', reason? }` | `200` | `400` (`moderator` refusé), `404`, `403` |
| `GET /api/moderation/events?status=&page=` | — | `200 Page<EventSummary>` | `403` |
| `POST /api/moderation/events/:id/cancel` | `{ reason }` | `200 EventDetail` | `404`, `409 INVALID_EVENT_TRANSITION` |
| `GET /api/moderation/actions?page=` | — | `200 Page<ModerationActionEntry>` | `403` |

Il n'existe **aucune** route de modération sur les conversations ou les messages.
