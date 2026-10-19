# Re-Tired Hearts

Service fictif de **Happy Retired** : une plateforme qui aide les personnes de plus de 60 ans à
rencontrer des gens partageant leurs centres d'intérêt, puis à se retrouver lors d'activités locales.

Projet pédagogique Holberton — **NestJS + Vue.js + PostgreSQL**.

> **État : tâche 0 terminée.** Le cadrage, le modèle de données et les contrats d'API sont écrits ;
> le socle technique démarre et une première route est consommée par un écran Vue. Les comptes, les
> événements, la messagerie et la modération arrivent dans les tâches 1 à 4.

## Documentation

| Document | Contenu |
|---|---|
| [docs/equipe-et-perimetre.md](docs/equipe-et-perimetre.md) | Équipe, planning, périmètre du MVP, exclusions, conventions Git |
| [docs/modele-donnees.md](docs/modele-donnees.md) | Les 9 entités, le diagramme, les relations et les contraintes |
| [docs/regles-metier.md](docs/regles-metier.md) | Rôles, statuts, confidentialité, capacité, cycle de vie, éligibilité des conversations |
| [docs/contrats-api.md](docs/contrats-api.md) | Routes, entrées, sorties, permissions et erreurs de tout le MVP |
| [docs/architecture.md](docs/architecture.md) | Choix techniques, organisation du code, API externe, tests, **registre des risques** |

## Structure du dépôt

```
api/     API NestJS (TypeScript, TypeORM, PostgreSQL)
web/     Interface Vue 3 (Vite)
docs/    Documentation de conception
docker/  Script d'initialisation PostgreSQL (création de la base de test)
```

## Prérequis

- Docker Desktop (ou Docker Engine) avec Docker Compose v2
- Pour travailler hors conteneur : Node.js 22 LTS et npm 10+

## Démarrage rapide (tout en conteneurs)

```bash
cp .env.example .env
docker compose up --build
```

| Service | URL | Remarque |
|---|---|---|
| Interface Vue | <http://localhost:8080> | nginx sert l'application et transmet `/api` |
| API NestJS | <http://localhost:3000/api> | |
| Documentation OpenAPI | <http://localhost:3000/api/docs> | Routes implémentées |
| Santé de l'API | <http://localhost:3000/api/health> | Utilisée par la sonde Compose |
| PostgreSQL | `localhost:5442` | Port modifiable via `DATABASE_PORT` |

**Ordre de démarrage :** `db` doit être déclaré sain (`pg_isready`) avant que `api` ne démarre ;
l'API joue alors les migrations puis se lance. `web` attend que l'API réponde sur `/api/health`.
Les trois services sont donc liés par `depends_on: condition: service_healthy`, pas par un simple
ordre de lancement.

## Développement hors conteneur

```bash
cp .env.example .env
docker compose up -d db          # PostgreSQL seul

cd api && npm install
npm run migration:run            # crée le schéma depuis une base vide
npm run start:dev                # http://localhost:3000/api

cd ../web && npm install
npm run dev                      # http://localhost:5173 (proxy /api vers le port 3000)
```

## Base de données

Le schéma n'est modifié **que** par des migrations versionnées ; `synchronize` est désactivé.

```bash
cd api
npm run migration:run            # applique les migrations en attente
npm run migration:show           # liste les migrations et leur état
npm run migration:revert         # annule la dernière migration
npm run db:reset                 # supprime tout le schéma puis rejoue les migrations
npm run migration:generate -- src/database/migrations/<NomEnPascalCase>
```

Repartir d'un volume PostgreSQL totalement vierge :

```bash
docker compose down -v && docker compose up --build
```

| Migration | Contenu |
|---|---|
| `InitialSchema` | Types énumérés, les 9 tables, clés, contraintes et index |
| `SeedInterests` | 16 centres d'intérêt de référence |

Les comptes et données de démonstration ne sont pas des migrations : ils viendront d'un script de
seed (tâche 5).

## Dépendances et fichiers de lock

Les images Docker utilisent `npm ci`, qui exige un `package-lock.json` exactement synchronisé avec
le `package.json`. Or deux versions majeures de npm ne résolvent pas toujours l'arborescence de la
même façon : un `npm install` lancé avec un npm plus récent que celui de l'image `node:22-alpine`
(npm 10) peut retirer des entrées du lock et faire échouer la construction de l'image.

Après avoir ajouté ou mis à jour une dépendance, régénérez donc le lock avec le npm de l'image :

```bash
cd api && npm run lock:refresh    # idem dans web/
```

Si `docker compose build` échoue sur `npm ci can only install packages when your package.json and
package-lock.json are in sync`, c'est exactement ce cas : lancez la commande ci-dessus et commitez le
lock régénéré.

## Tests

```bash
cd api && npm test               # tests unitaires Jest
docker compose up -d db           # requis pour les tests d'intégration PostgreSQL
cd api && npm run test:integration # tests des règles d'événement sur re_tired_hearts_test
cd web && npm test               # tests de composants Vitest
```

Résultats au moment de la livraison de la tâche 0 : **4 tests API** et **3 tests Vue** au vert. Les
tests bout en bout de l'API (Supertest sur la base `re_tired_hearts_test`, créée automatiquement au
premier démarrage de PostgreSQL) arrivent avec les routes authentifiées, en tâche 1.

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example). `.env` est ignoré par Git et ne doit
jamais être commité. L'API valide ces variables au démarrage et échoue immédiatement en listant
celles qui manquent, sans jamais afficher leur valeur.

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` | Connexion PostgreSQL | `rth` / — / `re_tired_hearts` |
| `DATABASE_HOST` / `DATABASE_PORT` | Hôte et port vus depuis l'API | `localhost` / `5442` |
| `DATABASE_LOGGING` | Affiche les requêtes SQL | `false` |
| `API_PORT`, `API_HOST_PORT` | Port de l'API et port publié | `3000` |
| `WEB_HOST_PORT` | Port publié de l'interface | `8080` |
| `SWAGGER_ENABLED` | Expose `/api/docs` | `true` |

## Ce que fait la tâche 0

- Les 9 entités du modèle sont déclarées et créées par une migration versionnée rejouable depuis une
  base vide.
- Deux routes publiques : `GET /api/health` et `GET /api/interests`.
- Un écran Vue (l'accueil) consomme `GET /api/interests` et gère les quatre états : chargement, vide,
  erreur avec bouton « Réessayer », succès.
- Toutes les erreurs ont un format unique `{ statusCode, code, message }` ; aucune trace technique
  n'est renvoyée au navigateur.
- Les champs inconnus d'une requête sont rejetés (`forbidNonWhitelisted`), ce qui empêchera dès la
  tâche 1 qu'un compte s'attribue un rôle.

## Limites connues

- Pas encore d'authentification : les routes actuelles sont publiques et sans donnée personnelle.
- Pas encore de données de démonstration (comptes membre, organisateur, modérateur) : tâche 5.
- L'intégration de l'API de recherche de communes est spécifiée mais pas implémentée : tâche 5.
- Pas de tests bout en bout tant qu'il n'y a pas de route protégée à vérifier.
