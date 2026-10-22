# Compte rendu QA — audit de l’API

**Date :** 2026-10-22  
**Périmètre :** audit statique de `api/`, avec lecture de l’architecture, des règles métier, du contrat API et du modèle de données.

## Synthèse

Aucune vulnérabilité exploitable n’a été démontrée par une requête réelle ou un test exécuté. L’audit statique a relevé une configuration HTTP présente dans Compose et Nginx : elle devient un risque de confidentialité si le service est exposé sur un réseau non fiable sans terminaison TLS en amont. Cette condition de déploiement n’a pas été vérifiée ; le point est donc classé **à vérifier**, et non comme une vulnérabilité confirmée.

Les autres points sont des précautions de configuration ou des ambiguïtés documentaires. Les contrôles de sécurité cités comme conformes sont des vérifications ponctuelles, pas une validation exhaustive de toutes les routes ni de tous les personas.

## Constats à vérifier — du plus grave au moins grave

### [Moyenne] Transport HTTP dans la configuration Compose

- **Statut :** à vérifier — configuration constatée, exposition vulnérable non démontrée.
- **Règle / OWASP :** D12 · A02 / A05.
- **Fichiers :** `docker-compose.yml:55-56`, `web/nginx.conf:1-2, 9-14`, `api/src/auth/auth.controller.ts:45-57`.
- **Scénario d’impact :** si le port publié par Compose est accessible depuis un réseau non fiable sans terminaison TLS en amont, un observateur du trafic pourrait intercepter des identifiants de connexion transmis par l’application.
- **Preuve :** Compose publie le port web `8080` ; Nginx écoute en HTTP et relaie les requêtes vers l’API en HTTP. Le contrôleur reçoit les identifiants dans le corps de la requête. L’exposition réseau réelle et la présence éventuelle d’un proxy TLS en amont n’ont pas été vérifiées.
- **Confiance :** élevée pour la configuration des fichiers ; faible à moyenne pour l’impact en déploiement réel, qui dépend de l’environnement.
- **Recommandation :** vérifier la configuration de production et ne servir l’application que derrière HTTPS. Réserver l’exposition HTTP de Compose à un environnement local contrôlé.

### [Moyenne] Swagger activé par défaut dans Compose

- **Statut :** à vérifier — la configuration par défaut est constatée, son usage en production ne l’est pas.
- **Règle / OWASP :** D15 · A05.
- **Fichiers :** `docker-compose.yml:26, 34`, `api/src/app.setup.ts:33-39`.
- **Scénario d’impact :** si cette configuration est utilisée en production, `/api/docs` peut rendre visibles les routes et leurs schémas, facilitant la reconnaissance de la surface d’attaque.
- **Preuve :** Compose transmet `SWAGGER_ENABLED=true` par défaut et l’application monte la documentation sur `/api/docs`. Aucun déploiement réel n’a été inspecté.
- **Confiance :** élevée sur la configuration du dépôt ; conditionnelle sur l’exposition en production.
- **Recommandation :** désactiver Swagger en production ou protéger son accès.

### [Faible] Le seed de démonstration dépend d’une activation explicite

- **Statut :** à vérifier — précaution de déploiement.
- **Règle / OWASP :** D16 · A05.
- **Fichier :** `api/src/database/seed.ts:221-232`.
- **Scénario d’impact :** l’activation accidentelle du seed sur une base réelle pourrait y créer des comptes de démonstration.
- **Preuve :** un mot de passe de démonstration est présent dans le seed ; son exécution en production est conditionnée par `ALLOW_DEMO_SEED`. Aucune valeur effective de cette variable en production n’a été vérifiée.
- **Confiance :** élevée sur le mécanisme ; l’activation réelle n’est pas établie.
- **Recommandation :** s’assurer que `ALLOW_DEMO_SEED` est désactivée pour les environnements réels et documenter clairement le caractère démo des comptes.

### [Info] Contradiction documentaire sur la désinscription d’un profil bloqué

- **Statut :** risque de cohérence documentaire — comportement du code non confirmé.
- **Règle / OWASP :** R-STATUS-2, R-REG-5.
- **Fichiers :** `docs/regles-metier.md:51`, `docs/contrats-api.md:196`.
- **Scénario d’impact :** l’interprétation divergente des règles peut conduire à des comportements différents entre l’API, les attentes métier et les tests concernant la désinscription d’un profil bloqué.
- **Preuve :** R-STATUS-2 interdit au profil bloqué les routes protégées hors lecture de son compte/profil et déconnexion ; le contrat décrit `DELETE /api/events/:id/registration` comme accessible à un compte actif « même si le profil n’est plus approuvé ».
- **Confiance :** élevée sur la contradiction documentaire ; le résultat effectif de l’API n’a pas été testé.
- **Recommandation :** décider explicitement si cette exception inclut le profil bloqué, puis aligner règle, contrat, implémentation et tests.

### [Info] R-MOD-5 laisse ouverte la rétrogradation d’un organisateur

- **Statut :** risque métier et d’intégrité non tranché.
- **Règle / OWASP :** R-MOD-5.
- **Fichier :** `docs/regles-metier.md:219`.
- **Scénario d’impact :** une rétrogradation pourrait laisser des événements publiés sans organisateur autorisé à les gérer.
- **Preuve :** la règle identifie elle-même ce cas comme une question ouverte. Aucun test du scénario n’a été exécuté.
- **Confiance :** élevée sur le caractère non tranché ; l’existence d’un impact effectif dépend du comportement métier choisi.
- **Recommandation :** définir le traitement des événements à venir lors d’une rétrogradation — par exemple, empêcher la transition ou prévoir leur annulation et sa journalisation — puis ajouter des tests correspondants.

## Contrôles conformes observés — vérifications ciblées

Ces observations apportent des éléments favorables, mais ne prouvent pas à elles seules que toutes les règles sont respectées dans tous les parcours.

- **Authentification et session :** Argon2id est utilisé (`api/src/auth/password.service.ts:8-14`). Les attributs du cookie sont définis dans `api/src/auth/auth.controller.ts:81-91`. La garde relit le compte et vérifie `sessionVersion` (`api/src/auth/jwt-auth.guard.ts:59-75`).
- **Autorisation et validation :** des gardes globales sont déclarées dans `api/src/auth/auth.module.ts:31-32` ; la validation globale rejette les champs non déclarés dans `api/src/app.setup.ts:21-29`. Le service d’événements vérifie la propriété dans `api/src/events/events.service.ts:29-45`.
- **Confidentialité :** l’accès à l’adresse exacte d’un événement est contrôlé (`api/src/events/events.service.ts:107-109, 241-256`) ; la découverte de profils utilise une projection explicite (`api/src/profiles/discovery.service.ts:107-122`).
- **Inscriptions :** le code verrouille l’événement avant le comptage dans une transaction (`api/src/events/registrations.service.ts:26-29`, `api/src/events/lock-event.ts:6-9`).
- **Messagerie :** la lecture et l’envoi vérifient la participation à la conversation (`api/src/messaging/conversations.service.ts:107-114, 209-212`).
- **Modération :** des changements d’état et leurs journaux sont écrits transactionnellement (`api/src/moderation/moderation.service.ts:203-208, 248-257, 366-376`). Une migration retire les inscriptions futures en cas de suspension ou de blocage (`api/src/database/migrations/1792395636800-WithdrawOnModeration.ts:8-44`).
- **Base de données :** `synchronize` est désactivé (`api/src/database/typeorm.config.ts:19`). Les requêtes dynamiques examinées utilisent des paramètres.

## Périmètre et limites de couverture

- **Périmètre examiné statiquement :** `api/src/` — routes, contrôleurs, gardes, DTO, services, entités, configuration, migrations, seed et tests backend — ainsi que `docker-compose.yml` et la configuration Nginx pertinente.
- **Documents consultés :** instructions du projet, `docs/architecture.md`, règles métier, contrat API, modèle de données et périmètre de l’équipe.
- **Non vérifié dynamiquement :** matrice route × persona par requêtes réelles ; courses concurrentes ; rollback provoqué de l’écriture d’audit ; exposition réseau et terminaison TLS en production ; valeurs effectives des variables de configuration en production.
- **Frontend :** non audité.
- **Portée des éléments conformes :** contrôles ponctuels dans le code ; ils ne constituent pas une certification de sécurité ou de conformité de l’API entière.

## Tests

Aucun test n’a été exécuté. Les tests end-to-end peuvent réinitialiser leur base et effectuer des `TRUNCATE` (`api/test/e2e/assert-test-database.ts:3-8`, `api/test/e2e/authorization.e2e-spec.ts:29, 49`). En l’absence de confirmation d’une base de test sûre conforme aux règles du projet, leur exécution a été écartée.

**Aucun code, rapport ou test préexistant n’a été modifié par l’audit.**
