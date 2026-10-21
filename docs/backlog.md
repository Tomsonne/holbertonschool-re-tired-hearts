# Backlog — missions du projet

Les 34 missions existent comme **issues GitHub** portant les mêmes numéros, déjà assignées. La
colonne *Étu.* reprend cette répartition :

| Étu. | Membre | GitHub | Missions |
|:-:|---|---|:-:|
| **A** | Jason | `@ToujoursPareil8` | 9 |
| **B** | Thomas | `@Tomsonne` | 11 |
| **C** | Benjamin | `@benji3106` | 9 |
| **A B C** | toute l'équipe | — | 5 |

**Charge totale :** ≈ 105 h, soit 35 h par étudiant sur la semaine.

| Taille | Charge |
|---|---|
| **S** | ≈ 2 h |
| **M** | ≈ 4 h |
| **L** | ≈ 6 h |

**Colonnes du tableau GitHub :** `À faire` → `En cours` → `En revue` → `Terminé`

**Étiquettes :** `tache-0` … `tache-6` · `api` `web` `bdd` `docker` `docs` · `tests` `securite`
`accessibilite` · `bloquant`

> Une mission n'est `Terminé` que si elle respecte la définition de « terminé » de
> [equipe-et-perimetre.md](equipe-et-perimetre.md) : migration si le schéma change, contrôle
> d'autorisation côté serveur, écran avec ses quatre états, test du cas nominal **et** d'un cas
> refusé, contrats d'API à jour.

---

## Tâche 0 — reste à faire

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 1 | Compléter la fiche d'équipe | Noms, pseudos GitHub et disponibilités dans `equipe-et-perimetre.md` · Coéquipiers ajoutés comme collaborateurs · `main` protégée : pull request et 1 validation | S | A B C |

## Tâche 1 — Comptes, profils et découverte · *jalon « Mardi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 2 | Hachage des mots de passe et stratégie de session `bloquant` | Argon2id dans un service dédié, aucun mot de passe journalisé ni renvoyé · JWT dans un cookie `httpOnly`, `SameSite=Strict`, 2 h · `session_version` relu en base à chaque requête · Stratégie documentée dans `architecture.md` | M | A |
| 3 | Gardes et décorateurs d'autorisation réutilisables `bloquant` | `JwtAuthGuard` global, `@Public()`, `@CurrentUser()`, `@RequireAccess()`, `@Roles()` · Ordre : authentification → compte → profil → rôle → propriété · Rôle et statuts toujours relus en base · Test unitaire de chaque garde | M | A |
| 4 | Routes inscription, connexion, déconnexion et `/me` | `register` crée le compte **et** son profil `pending`, rôle `member` · Doublon → `409` · E-mail inconnu et mot de passe faux → le même `401` · `logout` idempotent · Compte suspendu limité à `/me` et déconnexion | M | A |
| 5 | Profil : consultation et édition de son propre profil | `GET` et `PUT /api/me/profile` · Ni `role`, ni `status`, ni `email` dans le DTO ; champ inconnu → `400` · `missingForApproval` liste ce qui manque · Profil `blocked` en lecture seule | M | A |
| 6 | Découverte des profils approuvés | Seulement `approved` + `discoverable` + compte `active` · Filtres centre d'intérêt et département, paginés · Tout cas non autorisé → le même `404 PROFILE_UNAVAILABLE` · Aucune donnée privée renvoyée | M | A |
| 7 | Seed : compte modérateur et comptes de démonstration | `npm run seed` crée modérateur, organisateur et membres approuvés · Identifiants non sensibles documentés · Rejouable sans doublon | S | B |
| 8 | Écrans Vue inscription et connexion | Libellés visibles, erreurs près du champ et en résumé · Magasin de session et garde de navigation · Session expirée → connexion puis retour à la page demandée · Utilisable au clavier seul | M | C |
| 9 | Écran Vue « Mon profil » | Édition des centres d'intérêt, ville et confidentialité · Bandeau selon le statut : en attente, approuvé, bloqué · Quatre états gérés | M | C |
| 10 | Écran Vue découverte des membres | Liste filtrable et paginée, état « aucun résultat » · Fiche sans donnée privée · Lisible à 375 px sans défilement horizontal | M | C |
| 11 | Tests d'autorisation des comptes et profils | Anonyme → `401` · Un membre ne modifie pas le profil d'un autre · `{"role":"moderator"}` → `400`, rôle inchangé en base · Profil `pending` ou `blocked` absent de la découverte | M | A |

## Tâche 2 — Événements et inscriptions · *jalon « Mercredi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 12 | Création, édition et cycle de vie des événements `bloquant` | `draft` → `published` → `cancelled` / `completed`, transitions invalides refusées · Création réservée à `organizer` avec profil approuvé · Brouillon visible de son seul organisateur · Seul un brouillon sans inscrit est supprimable | L | B |
| 13 | Filtres par centre d'intérêt et par ville | Filtres combinables et paginés · Aucune adresse exacte dans la liste · Seuls les événements publiés et à venir | S | B |
| 14 | Inscription et désinscription avec capacité atomique `bloquant` | Transaction avec `SELECT … FOR UPDATE` avant comptage · Une seule ligne par membre et par événement, réactivée à la réinscription · L'organisateur ne s'inscrit pas chez lui · Capacité jamais sous le nombre d'inscrits | L | B |
| 15 | Liste des participants et adresse exacte | Adresse exacte réservée à l'organisateur, aux inscrits et aux modérateurs · Même règle pour la liste des participants | S | B |
| 16 | Écrans Vue liste et détail d'événement | Carte : date, ville, organisateur, places restantes, statut · Bandeau explicite si annulé, terminé ou complet · Inscription et désinscription avec retour visible | M | C |
| 17 | Écrans Vue de gestion pour l'organisateur | Création, édition, publication, annulation, clôture · Confirmation nommant l'événement avant annulation · Erreurs de l'API affichées telles quelles | M | C |
| 18 | Tests des événements et des inscriptions | Doublon, événement complet, annulé ou passé · Deux inscriptions simultanées sur la dernière place : une seule réussit · Modification de l'événement d'autrui refusée | M | B |

## Tâche 3 — Messagerie privée · *jalon « Jeudi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 19 | Éligibilité et création d'une conversation `bloquant` | Contact réservé aux inscrits d'un même événement ou à son organisateur · Une inscription retirée ne donne aucun droit · Paire unique : relancer renvoie la conversation existante · Refus si profil non approuvé ou messages refusés | L | B |
| 20 | Envoi et historique des messages | Expéditeur déduit de la session · 1 à 1000 caractères après nettoyage, sinon `400` · Historique chronologique paginé · Conversation d'autrui → `404`, modérateur compris | M | B |
| 21 | Écrans Vue boîte de réception et conversation | Messages ordonnés, expéditeur identifié, états vide / chargement / erreur · Compteur de caractères et message d'erreur lisible · Affichage par interpolation, jamais `v-html` | M | C |
| 22 | Tests de confidentialité de la messagerie | Conversation non liée → `404` · Message vide ou trop long → `400` · Doublon impossible dans les deux sens · Compte suspendu ou profil bloqué : envoi refusé | M | B |

## Tâche 4 — Modération et sécurisation · *jalon « Jeudi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 23 | Routes de modération et journal d'audit `bloquant` | Approuver, bloquer, débloquer un profil ; suspendre, réactiver un compte ; annuler un événement · Chaque action écrite dans `moderation_actions`, même transaction · Un modérateur n'en cible pas un autre · Aucun accès aux messages | L | A |
| 24 | Restrictions de statut appliquées à toute l'API | `pending`, `blocked`, `suspended` appliqués côté API, pas seulement dans Vue · Compte suspendu refusé partout sauf `/me` et déconnexion · Rôle et statuts non modifiables par requête forgée | M | A |
| 25 | Back-office Vue de modération | Files des profils en attente, des comptes et des événements · Confirmation nommant la cible avant action destructrice · Inaccessible à un membre, côté route comme côté API | M | C |
| 26 | Mentions légales et explication de la vie privée | Pages atteignables depuis le pied de page, en langage simple · Ce qui est visible, ce qui reste privé, comment les données sont traitées | S | C |
| 27 | En-têtes de sécurité, limitation de débit et erreurs sûres | `helmet` configuré · Limitation sur connexion, inscription et envoi de messages (route de l’issue 20) · Aucune trace, aucun secret ni message privé dans une erreur | M | A |
| 28 | Plan de recette et revue de sécurité | `security-review.md` : scénarios, résultats attendus et obtenus · Par risque : impact, mitigation, limite restante · Vérification clavier, zoom 200 %, largeur mobile | M | A B C |

## Tâche 5 — Livraison reproductible · *jalon « Vendredi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 29 | API externe de recherche de communes | `GET /api/cities` avec délai de 3 s, validation et cache · En cas d'échec, saisie manuelle : le parcours reste possible · Fournisseur, limites et repli documentés | M | B |
| 30 | Seed complet et procédure de réinitialisation | Comptes des trois rôles, profils approuvés, événements, inscriptions, conversations · Aucune donnée réelle · Procédure de reset documentée | M | B |
| 31 | README final, métadonnées et éco-conception | Installation, lancement, migrations, reset, tests, comptes de démo, limites · Titres de page utiles, alternatives textuelles, ressources légères | M | C |
| 32 | Vérification depuis un clone propre | `git clone` → `.env` → `docker compose up` → démo, en suivant le seul README · Tests exécutés et résultats consignés, échecs compris | M | A B C |

## Tâche 6 — Soutenance · *jalon « Vendredi »*

| # | Mission | Critères d'acceptation | Taille | Étu. |
|:-:|---|---|:-:|:-:|
| 33 | Scénario de démonstration et répétition | Parcours complet : connexion, profil, découverte, filtre, inscription, message privé · Second scénario : erreur de validation, action interdite, action de modération · Deux passages, chacun présente une partie qu'il n'a pas écrite seul | M | A B C |
| 34 | Checklist de livraison finale | Code, migrations, seed, tests et documentation à jour · Une amélioration laissée hors MVP, identifiée et justifiée | S | A B C |

---

## Charge par jour

| Jalon | Missions | Charge |
|---|---|---|
| Mardi — Comptes et profils | 2 à 11 | ≈ 38 h |
| Mercredi — Événements | 12 à 18 | ≈ 28 h |
| Jeudi — Messagerie et modération | 19 à 28 | ≈ 42 h |
| Vendredi — Livraison et soutenance | 29 à 34 | ≈ 22 h |

## Ordre à respecter

Les missions `bloquant` conditionnent les autres :

- **2** et **3** avant tout le reste de la tâche 1 ;
- **12** et **14** avant la messagerie ;
- **23** avant le back-office de modération.

Un bon réflexe : à trois, prenez d'abord 2, 3 et 7 en parallèle le mardi matin, puis ouvrez les
écrans Vue dès que les routes correspondantes répondent.
