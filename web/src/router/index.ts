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
    // Les pages réservées aux membres déclareront `meta: { connexionRequise: true }`
    // (ex. « Mon profil », mission 9).
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
  // Si l'on ne se croyait pas connecté (ex. vieux cookie au démarrage), il n'y a rien à expliquer.
  if (!session.estConnecte) return;
  session.oublierSession();

  const pageActuelle = router.currentRoute.value;
  if (pageActuelle.name === 'connexion') return;
  void router.push({
    name: 'connexion',
    query: { redirect: pageActuelle.fullPath, raison: 'session-expiree' },
  });
});
