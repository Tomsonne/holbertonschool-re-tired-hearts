import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';

// Les gardes de navigation (session, profil approuvé, rôle) arrivent en tâche 1.
// Elles ne remplaceront jamais les contrôles faits par l'API.
export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'accueil', component: HomeView, meta: { title: 'Accueil' } }],
});
