# Compte rendu QA — audit du frontend `web/`

**Date :** 2026-10-22

**Périmètre :** audit statique de `web/` dans `origin/main` au commit `50203c2532f105e08e1c77b5c2e077dcecfd318d`, à la lumière de `docs/architecture.md`, des règles métier, du contrat API et du périmètre MVP.

## Synthèse

Le frontend de `origin/main` dispose des parcours d’organisation des sorties, de messagerie et de modération. Le précédent rapport signalait à tort leur absence ; ces fonctionnalités ont été ajoutées dans la révision main auditée. Des lacunes plus ciblées subsistent, notamment le filtre des sorties par ville, ainsi que des points UX et d’accessibilité. Aucun indice évident de vulnérabilité exploitable ou d’usage de HTML non échappé n’a été relevé dans l’examen statique. L’API, la base et les réponses HTTP réelles n’ont pas été auditées ici.

## Constats avérés — classés par gravité

### [Info] Les parcours organisateur, messagerie et modération existent dans main

- **Statut :** avéré.
- **Confiance :** élevée.
- **Écart avec le rapport précédent :** le constat d’absence est faux pour la révision auditée.
- **Fichiers :** `web/src/router/index.ts:53-73,80-114`, `web/src/components/EnTeteSession.vue:40-45`, `web/src/api/sorties.ts:60-70,81-99`, `web/src/views/MesSortiesView.vue:75-99,120-153`, `web/src/views/EventFormView.vue:153-186,322-347`, `web/src/views/EventView.vue:395-399`, `web/src/components/GestionSortie.vue:70-78,96-109,214-255`.
- **Preuve :** les routes `/mes-sorties`, `/sorties/nouvelle` et `/sorties/:eventId/modifier` sont présentes. Le client permet de lister ses sorties, créer/modifier, publier, annuler, clôturer et supprimer un brouillon. Les vues et composants exposent la gestion selon le rôle, l’approbation, le statut et la propriété de la sortie. Des routes de messagerie et de modération ainsi que les clients associés sont aussi présents (`web/src/api/messagerie.ts`, `web/src/api/moderation.ts`).
- **Limite :** les gardes Vue ne remplacent pas l’autorisation côté API. Les réponses serveur et les contrôles d’accès réels n’ont pas été testés.

### [Info] Les pages publiques « mentions légales » et « vie privée » prévues n’existent pas

- **Statut :** avéré.
- **Confiance :** élevée.
- **Fichiers :** `web/src/router/index.ts:11-114`, `web/src/App.vue:32-36`.
- **Preuve :** aucune route ni aucun lien de pied de page ne mène à ces pages ; le pied de page n’affiche qu’une mention de projet pédagogique.
- **Écart documentaire :** `R-PROF-6` cite explicitement les mentions légales et la page vie privée parmi les pages visibles aux visiteurs (`docs/regles-metier.md:99-100`). Le périmètre prévoit également les mentions légales (`docs/equipe-et-perimetre.md:35`).
- **Impact :** un visiteur ne peut pas consulter depuis le site les informations de confidentialité et les mentions annoncées par le produit.
- **Recommandation :** ajouter les deux pages publiques et des liens persistants, notamment depuis le pied de page.

### [Faible — UX] Une panne réseau sur la vérification initiale est traitée comme une absence de session

- **Statut :** avéré par le flux de code ; non reproduit en test.
- **Confiance :** élevée.
- **Fichiers :** `web/src/api/http.ts:24-38`, `web/src/stores/session.ts:38-53`, `web/src/router/garde.ts:39-42`.
- **Preuve :** le client HTTP transforme une panne réseau en `ApiError` `NETWORK_ERROR`. À l’initialisation, le store met l’utilisateur à `null` et marque la session vérifiée ; il ne distingue pas cette erreur d’une absence de session. La garde peut alors rediriger vers la connexion.
- **Impact :** une coupure réseau temporaire au démarrage peut faire apparaître l’utilisateur comme déconnecté et masquer ses pages jusqu’à une nouvelle tentative de connexion ou un rechargement.
- **Recommandation :** distinguer une réponse d’authentification négative (`401`) d’une erreur réseau ; conserver un état « vérification indisponible » et permettre de réessayer `GET /me`.
- **Couverture de test :** les tests couvrent l’erreur réseau de déconnexion (`web/src/stores/session.spec.ts:71-78`), mais pas celle de la vérification initiale.

### [Faible — accessibilité] Le focus des résultats perd son indicateur visible après recherche

- **Statut :** avéré dans les styles.
- **Confiance :** élevée.
- **Fichiers :** `web/src/views/EventsView.vue:115-121,124-145,228-230`, `web/src/assets/main.css:630-633`.
- **Preuve :** après un filtre ou un changement de page, la vue déplace le focus sur le titre des résultats (`tabindex="-1"`), mais `.resultats h3:focus` supprime son contour.
- **Impact :** une personne naviguant au clavier peut perdre le repère visuel après la recherche, même si le focus a bien été déplacé.
- **Recommandation :** conserver un indicateur de focus visible pour ces titres, ou utiliser une annonce accessible sans déplacement de focus visuellement imperceptible.

### [Faible — lacune fonctionnelle] Le filtre des sorties ne propose pas la recherche par ville prévue

- **Statut :** avéré.
- **Confiance :** élevée.
- **Fichiers :** `web/src/api/sorties.ts:40-48`, `web/src/views/EventsView.vue:72,136-147,185-230`.
- **Preuve :** les filtres frontend ne transmettent que `interestId`, `departmentCode` et `page`. Le formulaire propose un centre d’intérêt et un département, mais pas de ville.
- **Écart documentaire :** le parcours P5 prévoit un filtrage par ville (`docs/equipe-et-perimetre.md:49`) et le contrat expose `cityName` et `cityCode` (`docs/contrats-api.md:154`).
- **Impact :** le filtrage demandé par ville n’est pas disponible dans l’interface.
- **Recommandation :** ajouter la saisie et la validation du filtre de ville, puis transmettre le paramètre documenté à l’API.

### [Faible — UX] Une personne suspendue garde un lien vers une page que le contrat lui interdit

- **Statut :** avéré dans l’interface ; refus API non exécuté ici.
- **Confiance :** élevée pour le parcours affiché.
- **Fichiers :** `web/src/App.vue:21-25`, `web/src/components/EnTeteSession.vue:52`.
- **Preuve :** l’en-tête affiche toujours le lien « Mon profil » à un utilisateur connecté, y compris suspendu. Cette page appelle la route de profil personnel. Le contrat réserve `GET /api/me/profile` aux comptes actifs et, pour une session suspendue, réserve l’accès à `GET /api/me` et à la déconnexion (`docs/contrats-api.md:26-33,102`).
- **Impact :** le lien conduit à une erreur plutôt qu’à un parcours cohérent de compte suspendu.
- **Recommandation :** masquer ou remplacer le lien « Mon profil » pour un compte suspendu et traiter ce statut explicitement dans les vues concernées. Ne pas modifier les autorisations serveur.

## Risques ou points à vérifier

### [À vérifier] Ancien signalement npm sur les dépendances de développement

- **Statut :** signalement historique, non revérifié sur la révision main auditée.
- **Preuve :** le réaudit `origin/main` n’a pas exécuté `npm audit`. Un audit précédent signalait 3 vulnérabilités dans l’arbre de développement ; ce résultat ne permet pas de conclure sur l’état actuel du lockfile.
- **Recommandation :** exécuter `npm audit` sur le lockfile exact de main avant de confirmer ou d’actualiser ce constat.

### [À vérifier] La recherche de communes peut ne pas annoncer les suggestions aux lecteurs d’écran

- **Confiance :** moyenne.
- **Fichier :** `web/src/views/ProfileView.vue:568-575`, ainsi que le composable partagé `web/src/composables/rechercheCommune.ts`.
- **Preuve :** l’état « recherche en cours » et l’échec sont annoncés avec `role="status"`, mais la liste de suggestions est simplement un `<ul aria-label="Communes proposées">`, sans région live ni sémantique de liste de suggestions explicitement associée au champ.
- **Impact possible :** une personne utilisant un lecteur d’écran pourrait ne pas être avertie de l’apparition des résultats tout en continuant à taper dans le champ.
- **À vérifier :** tester avec clavier et lecteur d’écran ; ajouter une annonce ou une interaction de suggestions adaptée si les résultats ne sont pas annoncés.

### [À vérifier] La CSP et les en-têtes de sécurité ne sont pas configurés dans le nginx du frontend

- **Confiance :** élevée pour le fichier audité, limitée pour le déploiement complet.
- **Fichier :** `web/nginx.conf:1-21`.
- **Preuve :** le fichier configure le proxy API et le fallback SPA, mais ne contient pas de directives `add_header` pour CSP, `X-Content-Type-Options`, `Referrer-Policy` ou `X-Frame-Options`.
- **Impact possible :** les réponses qui servent les fichiers statiques peuvent manquer de protections attendues, sauf si un proxy ou une couche de déploiement externe ajoute ces en-têtes.
- **À vérifier :** examiner les en-têtes réellement reçus sur le site déployé et la configuration d’éventuels proxies externes ; décider ensuite de la politique CSP compatible.

## Points conformes observés

- **Redirection de retour :** `cheminDeRetour()` refuse les destinations qui ne commencent pas par `/`, ainsi que `//` et `/\` (`web/src/router/redirection.ts:5-9`). Les tests de `router/garde.spec.ts:70-78` couvrent notamment une destination externe, une URL `javascript:` et des valeurs non chaînes.
- **Cookie et stockage frontend :** le client utilise des chemins `/api…` et `credentials: 'same-origin'` (`web/src/api/http.ts:27-35`). La recherche dans le code de production n’a pas trouvé d’usage de `localStorage`, `sessionStorage` ou de `v-html`. Le seul `innerHTML` trouvé concerne le nettoyage du DOM dans des tests.
- **Rendu des textes utilisateur :** les vues examinées affichent les textes par interpolation Vue. `web/src/views/MemberView.vue:12-14` sélectionne explicitement les champs publics à afficher. Cela ne vérifie pas les champs effectivement renvoyés par le serveur.
- **Bases d’accessibilité présentes :** lien d’évitement, titres de page, libellés de champs, aides associées, résumés d’erreurs, états `status`/`alert`, focus général visible et tailles de base supérieures aux minima annoncés (`main.css:89-90,133,256,348,487`).
- **États UX :** les principales vues examinées ont des états de chargement, d’erreur et de reprise ; les listes gèrent aussi l’absence de résultats. Cela ne remplace pas un test manuel des parcours au clavier, à fort zoom et sur lecteur d’écran.

## Tests et limites de couverture

- Aucun test, build, audit de dépendances, installation, appel API ou test navigateur n’a été exécuté pour cette revue de `origin/main`.
- Cette révision comprend 17 fichiers de tests front recensés. Les résultats antérieurs (12 fichiers, 139 tests, build réussi) appartiennent à une validation précédente et ne sont pas présentés comme validation de ce commit main.
- L’autorisation côté serveur, les réponses HTTP réelles, les en-têtes du déploiement complet, les contrastes mesurés, le rendu avec lecteur d’écran et les parcours dans un navigateur ne sont pas vérifiés.
- Aucun fichier applicatif, test ou dépendance n’a été modifié pendant l’audit. Ce rapport a été corrigé à la suite du réaudit. Le worktree local n’a pas été basculé sur main ; les sources évaluées ont été lues en lecture seule depuis `origin/main`.

## Statut des constats du rapport précédent

- Parcours organisateur, messagerie et modération absents : **infirmé** sur main ; les parcours sont disponibles.
- Pages mentions légales/vie privée : **confirmé comme absence d’interface**.
- Échec réseau lors de la vérification initiale de session : **confirmé dans le flux de code**, non reproduit par un test d’intégration.
- Focus invisible après recherche des sorties : **confirmé dans le code**.
- Filtre des sorties sans recherche par ville : **confirmé**.
- Lien « Mon profil » pour un compte suspendu : **confirmé côté interface** ; l’appel API n’a pas été exécuté.
- Suggestions de communes non annoncées : **à vérifier manuellement** avec un lecteur d’écran.
- En-têtes de sécurité : leur absence dans le fichier Nginx frontend est confirmée ; les en-têtes réellement servis en déploiement restent à vérifier.
- Tests et build rapportés dans la version précédente : **non revalidés** sur main ; ne pas les attribuer à ce commit.
