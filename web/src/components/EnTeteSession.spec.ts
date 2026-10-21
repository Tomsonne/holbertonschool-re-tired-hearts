import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import { useSessionStore } from '../stores/session';
import EnTeteSession from './EnTeteSession.vue';

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

async function monter() {
  const vide = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/page', name: 'page', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/inscription', name: 'inscription', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres', name: 'membres', component: vide },
    ],
  });
  await router.push('/page');
  const wrapper = mount(EnTeteSession, { global: { plugins: [router] } });
  await useSessionStore().verifierSession();
  await flushPromises();
  return { wrapper, router };
}

describe("zone de session de l'en-tête", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('propose la connexion et l\'inscription à un visiteur', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
    const { wrapper } = await monter();

    const liens = wrapper.findAll('a').map((a) => a.text());
    expect(liens).toEqual(['Se connecter', 'Créer un compte']);
  });

  it('affiche le nom du membre et le déconnecte', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const { wrapper, router } = await monter();

    expect(wrapper.text()).toContain('Connecté en tant que Odette');
    // Profil approuvé : accès à la découverte des membres et à son profil.
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Les membres', '/membres'],
      ['Mon profil', '/mon-profil'],
    ]);
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(authApi.logout).toHaveBeenCalledOnce();
    expect(useSessionStore().estConnecte).toBe(false);
    expect(router.currentRoute.value.name).toBe('accueil');
    expect(wrapper.text()).toContain('Se connecter');
  });

  it("ne propose pas la découverte des membres à un profil en attente", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...membre, profileStatus: 'pending' });
    const { wrapper } = await monter();

    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Mon profil']);
  });

  it("signale une déconnexion échouée, reste connecté et permet de réessayer", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    vi.mocked(authApi.logout)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Indisponible'))
      .mockResolvedValueOnce(undefined);
    const { wrapper, router } = await monter();

    await wrapper.get('button').trigger('click');
    await flushPromises();

    // Échec : le membre est toujours connecté, sur la même page, et il est prévenu.
    expect(useSessionStore().estConnecte).toBe(true);
    expect(router.currentRoute.value.name).toBe('page');
    expect(wrapper.get('[role="alert"]').text()).toContain('n’a pas abouti');
    expect(wrapper.get('button').text()).toBe('Réessayer la déconnexion');

    // Nouvel essai réussi : déconnexion effective et retour à l'accueil.
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(authApi.logout).toHaveBeenCalledTimes(2);
    expect(useSessionStore().estConnecte).toBe(false);
    expect(router.currentRoute.value.name).toBe('accueil');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
