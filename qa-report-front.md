# Compte rendu QA — audit du frontend `web/`

**Date :** 2026-10-22
**Périmètre :** réaudit statique de `web/`, à la lumière de `docs/architecture.md`, des règles métier, du contrat API et du périmètre MVP ; installation reproductible des dépendances et exécution Vitest/build.

## Synthèse

L’examen du front confirme plusieurs lacunes fonctionnelles par rapport au MVP documenté, ainsi que des problèmes d’ergonomie et d’accessibilité. Aucun indice évident de fuite de données privées ou d’usage de HTML non échappé n’a été relevé dans le code examiné. Cela ne prouve pas la sécurité de l’application : l’API, la base et les réponses réelles n’ont pas été auditées dans le cadre de cette partie.

## Constats avérés — classés par gravité

### [Majeur] Parcours MVP d’organisation, de messagerie et de modération absents

- **Statut :** avéré.
- **Confiance :** élevée.
- **Fichiers :** `web/src/router/index.ts:12-57`, `web/src/api/sorties.ts:40-59`.
- **Preuve :** le routeur ne déclare que l’accueil, connexion, inscription, profil, découverte et consultation/inscription aux sorties. Le client `sorties.ts` permet la liste, le détail, l’inscription et la désinscription, mais pas la création, publication, modification ou annulation des événements. L’inventaire de `web/src/api/` ne contient pas de client de messagerie ou de modération.
- **Écart documentaire :** le périmètre prévoit l’organisation d’événements (P7), la messagerie privée (P8) et la modération (P9) (`docs/equipe-et-perimetre.md:51-53`). Le contrat documente les opérations correspondantes (`docs/contrats-api.md:154-209,233-243`).
- **Impact :** les utilisateurs ne peuvent pas accomplir depuis le frontend plusieurs parcours centraux du MVP, même si les routes API correspondantes existent.
- **Recommandation :** ajouter les vues, routes et clients manquants, en gardant les contrôles d’accès côté API et en prévoyant les états chargement, vide, erreur et succès.

### [Modéré] Les pages publiques « mentions légales » et « vie privée » prévues n’existent pas

- **Statut :** avéré.
- **Confiance :** élevée.
- **Fichiers :** `web/src/router/index.ts:11-60`, `web/src/App.vue:32-36`.
- **Preuve :** aucune route ni aucun lien de pied de page ne mène à ces pages ; le pied de page n’affiche qu’une mention de projet pédagogique.
- **Écart documentaire :** `R-PROF-6` cite explicitement les mentions légales et la page vie privée parmi les pages visibles aux visiteurs (`docs/regles-metier.md:99-100`). Le périmètre prévoit également les mentions légales (`docs/equipe-et-perimetre.md:35`).
- **Impact :** un visiteur ne peut pas consulter depuis le site les informations de confidentialité et les mentions annoncées par le produit.
- **Recommandation :** ajouter les deux pages publiques et des liens persistants, notamment depuis le pied de page.

### [Modéré] Une panne réseau sur la vérification initiale est traitée comme une absence de session

- **Statut :** avéré par le flux de code ; non reproduit en test.
- **Confiance :** élevée.
- **Fichiers :** `web/src/api/http.ts:32-37`, `web/src/stores/session.ts:43-50`, `web/src/router/garde.ts`.
- **Preuve :** le client HTTP transforme une panne réseau en `ApiError` `NETWORK_ERROR`. À l’initialisation, le store met l’utilisateur à `null` et marque la session vérifiée ; il ne distingue pas cette erreur d’une absence de session. La garde peut alors rediriger vers la connexion.
- **Impact :** une coupure réseau temporaire au démarrage peut faire apparaître l’utilisateur comme déconnecté et masquer ses pages jusqu’à une nouvelle tentative de connexion ou un rechargement.
- **Recommandation :** distinguer une réponse d’authentification négative (`401`) d’une erreur réseau ; conserver un état « vérification indisponible » et permettre de réessayer `GET /me`.
- **Couverture de test :** les tests couvrent l’erreur réseau de déconnexion (`web/src/stores/session.spec.ts:71-78`), mais pas celle de la vérification initiale.

### [Faible] Le focus des résultats perd son indicateur visuel après une recherche

- **Statut :** avéré dans les styles.
- **Confiance :** élevée.
- **Fichiers :** `web/src/assets/main.css:630-633`, `web/src/views/DiscoveryView.vue:115,210`, `web/src/views/EventsView.vue:126,235`.
- **Preuve :** après un changement de filtre, les vues placent le focus sur le titre des résultats (`tabindex="-1"`), mais `.resultats h3:focus` supprime son contour (`outline: none`).
- **Impact :** une personne naviguant au clavier peut perdre le repère visuel après la recherche, même si le focus a bien été déplacé.
- **Recommandation :** conserver un indicateur de focus visible pour ces titres, ou utiliser une annonce accessible sans déplacement de focus visuellement imperceptible.

### [Modéré] Le filtre des sorties ne propose pas la recherche par ville prévue

- **Statut :** avéré.
- **Confiance :** élevée.
- **Fichiers :** `web/src/api/sorties.ts:40-48`, `web/src/views/EventsView.vue:72,136-147,185-230`.
- **Preuve :** les filtres frontend ne transmettent que `interestId`, `departmentCode` et `page`. Le formulaire propose un centre d’intérêt et un département, mais pas de ville.
- **Écart documentaire :** le parcours P5 prévoit un filtrage par ville (`docs/equipe-et-perimetre.md:49`) et le contrat expose `cityName` et `cityCode` (`docs/contrats-api.md:154`).
- **Impact :** le filtrage demandé par ville n’est pas disponible dans l’interface.
- **Recommandation :** ajouter la saisie et la validation du filtre de ville, puis transmettre le paramètre documenté à l’API.

### [Modéré] Une personne suspendue garde un lien vers une page que le contrat lui interdit

- **Statut :** avéré dans l’interface ; refus API non exécuté ici.
- **Confiance :** élevée pour le parcours affiché.
- **Fichiers :** `web/src/App.vue`, `web/src/components/EnTeteSession.vue:41`, `web/src/views/ProfileView.vue`.
- **Preuve :** l’en-tête affiche toujours le lien « Mon profil » à un utilisateur connecté, y compris suspendu. Cette page appelle la route de profil personnel. Le contrat réserve `GET /api/me/profile` aux comptes actifs et, pour une session suspendue, réserve l’accès à `GET /api/me` et à la déconnexion (`docs/contrats-api.md:26-33,102`).
- **Impact :** le lien conduit à une erreur plutôt qu’à un parcours cohérent de compte suspendu.
- **Recommandation :** masquer ou remplacer le lien « Mon profil » pour un compte suspendu et traiter ce statut explicitement dans les vues concernées. Ne pas modifier les autorisations serveur.

## Risques ou points à vérifier

### [À traiter] Vulnérabilités signalées dans les dépendances de développement

- **Statut :** signalement de l’analyse npm ; pas de vulnérabilité applicative exploitée pendant cet audit.
- **Confiance :** élevée pour le résultat de l’audit de dépendances.
- **Preuve :** `npm audit` signale 3 vulnérabilités dans l’arbre des dépendances de développement : 2 critiques et 1 modérée. Le lockfile fixe notamment `vitest` en `3.2.7` (`web/package-lock.json:2523-2524`), `@vitest/mocker` en `3.2.7` (`:1088-1089`) et `tinypool` en `1.1.1` (`:2335-2336`). Les avis mentionnent des risques liés à l’exécution de code et à la traversée de chemins.
- **Portée :** le rapport d’audit attribue ces vulnérabilités aux dépendances de développement, et non aux dépendances de production ; `npm audit --omit=dev` retourne 0 vulnérabilité. Le risque concerne principalement l’environnement de développement et de test, et dépend des conditions permettant d’influencer l’exécution de l’outillage.
- **Recommandation :** examiner les avis détaillés et planifier une mise à jour contrôlée de Vitest et de ses dépendances, puis relancer les tests. Aucun manifeste ni lockfile n’a été modifié lors de ce réaudit.

### [À vérifier] La recherche de communes peut ne pas annoncer les suggestions aux lecteurs d’écran

- **Confiance :** moyenne.
- **Fichier :** `web/src/views/ProfileView.vue:620-628`.
- **Preuve :** l’état « recherche en cours » et l’échec sont annoncés avec `role="status"`, mais la liste de suggestions est simplement un `<ul aria-label="Communes proposées">`, sans région live ni sémantique de liste de suggestions explicitement associée au champ.
- **Impact possible :** une personne utilisant un lecteur d’écran pourrait ne pas être avertie de l’apparition des résultats tout en continuant à taper dans le champ.
- **À vérifier :** tester avec clavier et lecteur d’écran ; ajouter une annonce ou une interaction de suggestions adaptée si les résultats ne sont pas annoncés.

### [À vérifier] La CSP et les en-têtes de sécurité ne sont pas configurés dans le nginx du frontend

- **Confiance :** élevée pour le fichier audité, limitée pour le déploiement complet.
- **Fichier :** `web/nginx.conf:1-20`.
- **Preuve :** le fichier configure le proxy API et le fallback SPA, mais ne contient pas de directives `add_header` pour CSP, `X-Content-Type-Options`, `Referrer-Policy` ou `X-Frame-Options`.
- **Impact possible :** les réponses qui servent les fichiers statiques peuvent manquer de protections attendues, sauf si un proxy ou une couche de déploiement externe ajoute ces en-têtes.
- **À vérifier :** examiner les en-têtes réellement reçus sur le site déployé et la configuration d’éventuels proxies externes ; décider ensuite de la politique CSP compatible.

## Points conformes observés

- **Redirection de retour :** `cheminDeRetour()` refuse les destinations qui ne commencent pas par `/`, ainsi que `//` et `/\` (`web/src/router/redirection.ts:5-9`). Les tests de `router/garde.spec.ts:70-78` couvrent notamment une destination externe, une URL `javascript:` et des valeurs non chaînes.
- **Cookie et stockage frontend :** le client utilise des chemins `/api…` et `credentials: 'same-origin'` (`web/src/api/http.ts:27-35`). La recherche dans le code de production n’a pas trouvé d’usage de `localStorage`, `sessionStorage` ou de `v-html`. Le seul `innerHTML` trouvé concerne le nettoyage du DOM dans des tests.
- **Rendu des textes utilisateur :** les vues examinées affichent noms, bio, descriptions et motifs par interpolation Vue. `MemberView.vue` sélectionne explicitement les champs publics à afficher ; les listes d’événements n’affichent que la ville et le département. Le test `EventsView.spec.ts` inclut des champs privés factices et vérifie qu’ils ne sont pas rendus.
- **Bases d’accessibilité présentes :** lien d’évitement, titres de page, libellés de champs, aides associées, résumés d’erreurs, états `status`/`alert`, focus général visible et tailles de base supérieures aux minima annoncés (`main.css:89-90,133,256,348,487`).
- **États UX :** les principales vues examinées ont des états de chargement, d’erreur et de reprise ; les listes gèrent aussi l’absence de résultats. Cela ne remplace pas un test manuel des parcours au clavier, à fort zoom et sur lecteur d’écran.

## Tests et limites de couverture

- Le premier `npm test` depuis `web/` a échoué avant exécution car `vitest` n’était pas reconnu.
- `npm ci` a restauré les dépendances à partir de `web/package-lock.json` avec succès (147 paquets ajoutés). Les fichiers `package.json` et `package-lock.json` n’ont pas été modifiés.
- Le second `npm test` a réussi : **12 fichiers de test, 139 tests passés, aucun échec**.
- `npm run build` a réussi : `vue-tsc --noEmit` et la compilation Vite se sont terminés sans erreur.
- `npm audit` signale 3 vulnérabilités (2 critiques, 1 modérée) dans les dépendances de développement ; `npm audit --omit=dev` retourne 0 vulnérabilité.
- L’environnement utilise Node **v25.9.0**, alors que l’architecture documente Node 22 LTS. `npm ci` a émis des avertissements de moteur pour certains paquets ; tests et build ont néanmoins réussi.
- Aucun test API, E2E, navigateur ou de base de données n’a été exécuté et aucun service n’a été démarré.
- L’analyse ne vérifie pas les réponses réelles de l’API, l’autorisation serveur, les contrastes par mesure automatisée, les comportements des lecteurs d’écran ni les en-têtes du déploiement complet.
- Aucun code applicatif, test existant ou manifeste de dépendances n’a été modifié. Les dépendances restaurées résident dans `web/node_modules/`.

## Statut des constats du rapport précédent

- Parcours MVP d’organisation, de messagerie et de modération absents : **confirmé**, preuves et références actualisées.
- Pages mentions légales/vie privée : **confirmé**.
- Échec réseau lors de la vérification initiale de session : **confirmé dans le flux de code**, non reproduit par un test d’intégration.
- Focus invisible après recherche : **confirmé**.
- Filtre des sorties sans recherche par ville : **confirmé**.
- Lien « Mon profil » pour un compte suspendu : **confirmé côté interface** ; l’appel API n’a pas été exécuté.
- Suggestions de communes non annoncées : **à vérifier manuellement** avec un lecteur d’écran.
- En-têtes de sécurité : leur absence dans le fichier Nginx frontend est confirmée ; les en-têtes réellement servis en déploiement restent à vérifier.
- L’indisponibilité initiale de Vitest : **résolue pour cette validation** après `npm ci`.
