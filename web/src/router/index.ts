import { createRouter, createWebHistory } from 'vue-router';
import { quandSessionExpire } from '../api/http';
import { useSessionStore } from '../stores/session';
import HomeView from '../views/HomeView.vue';
import { gardeDeSession } from './garde';

// Les gardes ne remplacent jamais les contrôles faits par l'API : elles évitent seulement
// d'afficher une page que l'API refuserait.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'accueil', component: HomeView, meta: { title: 'Accueil' } },
    {
      path: '/connexion',
      name: 'connexion',
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Connexion', invitesSeulement: true },
    },
    {
      path: '/inscription',
      name: 'inscription',
      component: () => import('../views/RegisterView.vue'),
      meta: { title: 'Inscription', invitesSeulement: true },
    },
    // Pages réservées aux membres connectés : la garde envoie vers la connexion, puis revient ici.
    {
      path: '/mon-profil',
      name: 'mon-profil',
      component: () => import('../views/ProfileView.vue'),
      meta: { title: 'Mon profil', connexionRequise: true },
    },
    // Réservées aux profils approuvés : l'écran l'explique lui-même (R-PROF-3), l'API refuse aussi.
    {
      path: '/membres',
      name: 'membres',
      component: () => import('../views/DiscoveryView.vue'),
      meta: { title: 'Les membres', connexionRequise: true },
    },
    {
      path: '/membres/:userId',
      name: 'membre',
      component: () => import('../views/MemberView.vue'),
      meta: { title: 'Profil d’un membre', connexionRequise: true },
    },
    // Ouvertes à tout membre actif dont le profil n'est pas bloqué, même en attente : l'écran
    // explique les refus, l'API refait ses contrôles.
    {
      path: '/sorties',
      name: 'sorties',
      component: () => import('../views/EventsView.vue'),
      meta: { title: 'Les sorties', connexionRequise: true },
    },
    // Réservée aux organisateurs : l'écran l'explique lui-même, l'API refuse aussi (ROLE_REQUIRED).
    // Déclarée avant /sorties/:eventId par lisibilité (les chemins ne se recouvrent pas).
    {
      path: '/mes-sorties',
      name: 'mes-sorties',
      component: () => import('../views/MesSortiesView.vue'),
      meta: { title: 'Mes sorties', connexionRequise: true },
    },
    // Créer et modifier : réservées aux organisateurs approuvés (l'écran l'explique, l'API refuse).
    {
      path: '/sorties/nouvelle',
      name: 'nouvelle-sortie',
      component: () => import('../views/EventFormView.vue'),
      meta: { title: 'Créer une sortie', connexionRequise: true },
    },
    {
      path: '/sorties/:eventId/modifier',
      name: 'modifier-sortie',
      component: () => import('../views/EventFormView.vue'),
      meta: { title: 'Modifier une sortie', connexionRequise: true },
    },
    {
      path: '/sorties/:eventId',
      name: 'sortie',
      component: () => import('../views/EventView.vue'),
      meta: { title: 'Une sortie', connexionRequise: true },
    },
  ],
});

router.beforeEach(gardeDeSession);

// Titre d'onglet utile (lu en premier par les lecteurs d'écran à chaque changement de page).
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} — Re-Tired Hearts` : 'Re-Tired Hearts';
});

// R-AUTH-6 : session expirée pendant la navigation → retour à la connexion avec explication,
// puis retour à la page en cours.
quandSessionExpire(() => {
  const session = useSessionStore();
  // Expiration au démarrage (GET /me) : utilisateur pas encore chargé. C'est la garde de
  // navigation qui affiche alors le message, grâce à session.sessionExpiree (voir garde.ts).
  if (!session.estConnecte) return;
  session.oublierSession();

  const pageActuelle = router.currentRoute.value;
  if (pageActuelle.name === 'connexion') return;
  void router.push({
    name: 'connexion',
    query: { redirect: pageActuelle.fullPath, raison: 'session-expiree' },
  });
});
