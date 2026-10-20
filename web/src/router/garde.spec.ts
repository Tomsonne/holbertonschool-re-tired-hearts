import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import { gardeDeSession } from './garde';
import { cheminDeRetour } from './redirection';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
const authApi = await import('../api/auth');

const membre: Me = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'odette@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Odette',
};

// Routeur de test : mêmes règles que le vrai, avec des pages vides.
function routeurDeTest() {
  const vide = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide, meta: { invitesSeulement: true } },
      { path: '/mon-profil', name: 'mon-profil', component: vide, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  return router;
}

describe('garde de navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('renvoie un visiteur non connecté vers la connexion en gardant la page demandée', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
    const router = routeurDeTest();

    await router.push('/mon-profil');

    expect(router.currentRoute.value.name).toBe('connexion');
    expect(router.currentRoute.value.query.redirect).toBe('/mon-profil');
  });

  it('laisse passer un membre connecté', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    const router = routeurDeTest();

    await router.push('/mon-profil');

    expect(router.currentRoute.value.name).toBe('mon-profil');
  });

  it('ne remontre pas la connexion à un membre déjà connecté', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    const router = routeurDeTest();

    await router.push('/connexion?redirect=/mon-profil');

    expect(router.currentRoute.value.name).toBe('mon-profil');
  });

  it('ignore un redirect vers un autre site', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    const router = routeurDeTest();

    await router.push('/connexion?redirect=//site-malveillant.example');

    expect(router.currentRoute.value.name).toBe('accueil');
  });

  it('explique une session expirée détectée au démarrage puis ramène à la page demandée (R-AUTH-6)', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'SESSION_EXPIRED', 'Session expirée.'));
    const router = routeurDeTest();

    await router.push('/mon-profil');

    expect(router.currentRoute.value.name).toBe('connexion');
    expect(router.currentRoute.value.query).toEqual({ redirect: '/mon-profil', raison: 'session-expiree' });

    // Le message n'est donné qu'une fois : la navigation suivante est normale.
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('accueil');
  });

  it("ajoute l'explication si le membre arrive directement sur la connexion avec un cookie expiré", async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'SESSION_EXPIRED', 'Session expirée.'));
    const router = routeurDeTest();

    await router.push('/connexion?redirect=/mon-profil');

    expect(router.currentRoute.value.name).toBe('connexion');
    expect(router.currentRoute.value.query).toEqual({ redirect: '/mon-profil', raison: 'session-expiree' });
  });
});

describe('cheminDeRetour', () => {
  it.each([
    ['/mon-profil?page=2', '/mon-profil?page=2'],
    ['https://site-malveillant.example', '/'],
    ['//site-malveillant.example', '/'],
    ['/\\site-malveillant.example', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
    [['/a', '/b'], '/'],
  ])('%s → %s', (entree, attendu) => {
    expect(cheminDeRetour(entree)).toBe(attendu);
  });
});
