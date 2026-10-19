# Équipe, périmètre et conventions

## 1. Équipe

> Chaque membre doit pouvoir expliquer **toute** l'architecture à l'oral, pas seulement sa partie.

| Membre | GitHub | Domaine principal | Disponibilité |
|---|---|---|---|
| **A — Jason** | [`@ToujoursPareil8`](https://github.com/ToujoursPareil8) | Comptes, profils, modération (`api/src/users`, `profiles`, `moderation`) | Lun–Ven 9h–18h |
| **B — Thomas** | [`@Tomsonne`](https://github.com/Tomsonne) | Événements, inscriptions, messagerie, API externe (`api/src/events`, `messaging`, `geo`) | Lun–Ven 9h–18h |
| **C — Benjamin** | [`@benji3106`](https://github.com/benji3106) | Interface Vue, accessibilité, Docker (`web/`) | Lun–Ven 9h–18h |

Chacun livre sa fonctionnalité **de bout en bout** : migration → route → écran Vue → test.

La répartition mission par mission est dans [backlog.md](backlog.md) ; les issues GitHub
correspondantes sont déjà assignées. Les missions #1, #28, #32, #33 et #34 sont portées par
l'équipe entière.

### Règles de travail

- Point quotidien de 10 minutes à 9h30 : hier, aujourd'hui, blocages.
- Bloqué plus de 45 minutes → on demande de l'aide, on ne reste pas seul.
- Chaque membre relit au moins une pull request de chaque autre membre dans la semaine.
- Le modèle de données et les règles métier ne changent que par pull request validée par l'équipe.
- `main` doit toujours démarrer avec `docker compose up`.

### Planning de la semaine (≈ 35 h par personne)

| Jour | Objectif | Critère de fin |
|---|---|---|
| Lun | Tâche 0 — cadrage, modèle, contrats, socle qui tourne | `docker compose up` affiche l'accueil Vue avec les centres d'intérêt venant de PostgreSQL |
| Mar | Tâche 1 — comptes, sessions, profils, découverte | Inscription → connexion → édition du profil → découverte d'un profil approuvé |
| Mer | Tâche 2 — événements et inscriptions | Brouillon → publication → inscription → désinscription → annulation |
| Jeu matin | Tâche 3 — messagerie | Deux membres éligibles échangent ; un tiers reçoit un refus |
| Jeu ap.-midi | Tâche 4 — modération, sécurité, mentions légales | Approuver / bloquer / suspendre / annuler + journal d'audit rempli |
| Ven matin | Tâche 5 — Docker, seed, API externe, README | Clone propre → README → démo qui fonctionne |
| Ven ap.-midi | Tâche 6 — répétition | Deux passages complets de la démo |

## 2. Périmètre du MVP

### Parcours couverts

| # | Parcours | Tâche |
|---|---|---|
| P1 | S'inscrire, se connecter, se déconnecter | 1 |
| P2 | Compléter son profil : ville, centres d'intérêt, présentation, choix de confidentialité | 1 |
| P3 | Faire approuver son profil par un modérateur | 1, 4 |
| P4 | Découvrir les profils approuvés | 1 |
| P5 | Parcourir les événements publiés et filtrer par centre d'intérêt et par ville | 2 |
| P6 | S'inscrire à un événement, puis se désinscrire | 2 |
| P7 | Organiser un événement : brouillon, publication, modification, annulation, clôture | 2 |
| P8 | Échanger des messages privés avec une personne rencontrée sur un événement | 3 |
| P9 | Modérer : approuver, bloquer, débloquer, suspendre, annuler un événement | 4 |

**Parcours de démonstration (tâche 6)** : P1 → P3 → P2 → P4 → P5 → P6 → P8, puis une erreur de
validation, une action interdite et une action de modération.

### Simplifications assumées

| Sujet | Choix du MVP | Raison |
|---|---|---|
| Localisation | Ville + département uniquement, pas de coordonnées ni de calcul de distance | Vie privée et temps disponible |
| Adresse des événements | Une adresse exacte, visible seulement des inscrits, de l'organisateur et des modérateurs | Pas de carte |
| Modération des profils | Modération **avant** publication pour les nouveaux profils ; les modifications suivantes restent en ligne et se traitent par blocage | Trois statuts suffisent |
| Messagerie | Boîte de réception asynchrone, rafraîchie au chargement de la page | Pas de WebSocket |
| Sessions | Un jeton JWT signé dans un cookie `httpOnly`, valable 2 h, sans jeton de rafraîchissement | Simple à expliquer |
| Clôture d'un événement | L'organisateur marque lui-même un événement passé comme terminé | Pas de tâche planifiée |
| Pays | France uniquement (codes postaux, codes INSEE, départements) | Correspond à l'API géo choisie |
| Photos | Badge avec les initiales, pas de photo de profil | Évite le stockage de fichiers et la modération d'images |

### Exclus explicitement

Chat temps réel, WebSockets, accusés de lecture, pièces jointes · algorithme de mise en relation,
recommandations · adresses exactes publiques, cartes, géolocalisation de l'appareil · envoi de photos ·
campagnes e-mail, vérification de l'adresse e-mail, réinitialisation du mot de passe par e-mail,
notifications · application mobile native (le site est responsive à la place) · paiements ·
vérification d'âge ou d'identité · signalement par les membres, classification automatique des
contenus · listes d'attente, événements récurrents, conversations de groupe · suppression de compte et
export des données en autonomie (traités manuellement, limite documentée) · interface multilingue.

## 3. Conventions Git

**Dépôt :** `holbertonschool-re-tired-hearts`. `main` est protégé : pull request + 1 validation.

### Branches

`<type>/<domaine>-<description-courte>` en minuscules, créée depuis un `main` à jour.

| Type | Usage | Exemple |
|---|---|---|
| `feat` | Nouvelle fonctionnalité | `feat/auth-route-connexion` |
| `fix` | Correction | `fix/events-capacite-concurrence` |
| `docs` | Documentation seule | `docs/registre-risques` |
| `test` | Tests seuls | `test/messagerie-acces-interdit` |
| `chore` | Outillage, Docker, dépendances | `chore/docker-healthchecks` |
| `refactor` | Réorganisation sans changement de comportement | `refactor/profiles-dto` |

Domaines : `api`, `web`, `db`, `auth`, `profiles`, `events`, `messaging`, `moderation`, `geo`,
`docker`, `docs`. La branche est supprimée après fusion.

### Commits — Conventional Commits

```
<type>(<domaine>): <résumé à l'impératif, 72 caractères max>
```

Exemples :

```
feat(auth): ajoute la route de connexion avec cookie de session
fix(events): verrouille la ligne événement avant de compter les inscriptions
test(messaging): refuse l'accès à la conversation d'autres membres
```

On ne commite jamais `.env`, un secret, une donnée personnelle réelle ou `node_modules`.

### Définition de « terminé »

1. Migration versionnée si le schéma change, avec un `down()` qui fonctionne.
2. Route API avec contrôle d'autorisation **côté serveur** et codes d'erreur documentés.
3. Écran Vue avec les états chargement / vide / succès / erreur, utilisable au clavier.
4. Au moins un test du cas nominal et un test d'une requête refusée.
5. `docs/contrats-api.md` mis à jour.

### Recréer une base vierge

```bash
cd api && npm run db:reset     # supprime tout le schéma puis rejoue les migrations
```

Avec Docker : `docker compose down -v && docker compose up --build` (le `-v` supprime le volume
PostgreSQL ; les migrations sont rejouées au démarrage de l'API).
