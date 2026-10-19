# Revue OWASP de l'API — 2026-10-19

Périmètre : `api/src` (auth, profiles dont découverte, interests, health, config, common, database), `docker-compose.yml`, `.env.example`, `.gitignore`. Lecture du code uniquement : aucun test d'intrusion ni base réelle (les requêtes de découverte n'ont été exécutées que contre des mocks). Ce n'est pas une certification de conformité.

## Constats

### 1. Énumération de comptes par temps de réponse — MOYENNE (confirmé, corrigé)
- **Fichier :** `api/src/auth/auth.service.ts` l. 74-90.
- **Preuve :** si l'e-mail est inconnu, l'expression `!user || …` court-circuite et `passwordService.verify` (Argon2id, coûteux) n'est jamais appelé ; la réponse est donc nettement plus rapide que pour un e-mail connu avec un mauvais mot de passe.
- **Impact :** R-AUTH-5 impose une réponse identique, mais le délai révèle quels e-mails ont un compte (A07 / A01).
- **Correctif proposé :** vérifier un hash factice Argon2id quand l'utilisateur n'existe pas, pour égaliser le temps.

### 2. Limitation de débit incomplète — MOYENNE (confirmé, corrigé)
- **Fichiers :** `api/src/auth/auth.controller.ts` l. 31-47, `api/src/auth/auth.module.ts` l. 28, `api/src/main.ts`.
- **Preuve :** seul `login` est limité (5 par 15 min) ; `register` (hachage Argon2id) et les routes de découverte ne le sont pas. Le compteur est par IP : sans `trust proxy`, derrière un reverse proxy toutes les requêtes partagent l'IP du proxy (risque de blocage global).
- **Impact :** déni de service par hachages répétés sur `register` ; scraping de la découverte par un membre approuvé ; blocage global ou contournement selon le déploiement (A04 / A05).
- **Correctif proposé :** throttle sur `register`, limite raisonnable sur `/api/profiles`, et configurer `trust proxy` selon le déploiement (issue #27 sur les limites de débit).

### 3. Écriture complète de l'utilisateur à la connexion — BASSE (corrigé)
- **Fichier :** `api/src/auth/auth.service.ts` l. 97-98.
- **Preuve :** `this.users.save(user)` réécrit l'entité lue plus tôt. TypeORM n'écrit que les colonnes modifiées, mais une lecture ancienne combinée à une suspension concurrente reste une fenêtre de course à vérifier.
- **Correctif proposé :** `update({ id }, { lastLoginAt })` pour ne toucher que cette colonne.

### 4. Révocation limitée de la session à la déconnexion — BASSE (conforme à la règle, à connaître)
- **Fichier :** `api/src/auth/auth.controller.ts` l. 60-63.
- **Preuve :** la déconnexion efface seulement le cookie (R-AUTH-4) ; un jeton volé reste valide jusqu'à 2 h.
- **Impact :** limité à la durée de vie du jeton ; la suspension et « se déconnecter partout » incrémentent `session_version`.
- **Correctif proposé :** documenté comme choix du MVP ; envisager « se déconnecter partout » plus tard.

### 5. Énumération par l'inscription — BASSE (voulu par le contrat)
- **Fichier :** `api/src/auth/auth.service.ts` l. 60-67.
- **Preuve :** `409 EMAIL_ALREADY_USED` révèle qu'un e-mail existe. C'est le comportement documenté ; combiné au point 2, cela facilite l'énumération.

## Points examinés sans constat
- **Contrôle d'accès (A01) :** gardes globales `JwtAuthGuard` puis `AccessGuard` ; routes publiques explicites (`@Public`), `/me/profile` limitée à l'utilisateur courant (identité issue de la session, jamais d'un paramètre), découverte réservée aux profils approuvés.
- **Fuite de données (A01/A02) :** `PublicProfileDto` construit par liste blanche ; aucune donnée privée (e-mail, code postal, code INSEE, hash) dans les réponses de découverte (couvert par test) ; `passwordHash` non sélectionné par défaut.
- **`PROFILE_UNAVAILABLE` (R-PROF-4) :** identifiant invalide, inconnu ou non visible renvoient la même réponse.
- **Injection (A03) :** requêtes paramétrées partout (QueryBuilder avec paramètres nommés, `queryRunner.query` avec paramètres) ; filtres validés par regex/entiers ; `synchronize: false`.
- **Mass assignment :** `ValidationPipe` global `whitelist` + `forbidNonWhitelisted` ; `role`, `status`, `email` refusés sur le profil.
- **Cryptographie / sessions (A02/A07) :** Argon2id ; JWT HS256 avec algorithme imposé, charge utile stricte, secret ≥ 32 caractères exigé au démarrage ; cookie `httpOnly`, `SameSite=Strict`, `Secure` en production, `Path=/api` ; rejet des sessions obsolètes.
- **Erreurs (A05/A09) :** filtre global renvoyant un 500 générique, sans trace ni détail SQL.
- **Secrets :** `.env` ignoré, `.env.example` avec valeurs factices, `JWT_SECRET` obligatoire dans Compose.
- **En-têtes :** `helmet` actif.

## À vérifier hors périmètre
- Swagger activé par défaut (`SWAGGER_ENABLED=true`) : à désactiver en production.
- Le port PostgreSQL est publié sur l'hôte par Compose : acceptable en local, à restreindre ailleurs.
- `npm audit` non exécuté dans cette revue.
- Journalisation d'audit et de sécurité absentes (issues #23 et #27).
