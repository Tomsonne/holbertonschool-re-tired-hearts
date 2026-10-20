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
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(authApi.logout).toHaveBeenCalledOnce();
    expect(useSessionStore().estConnecte).toBe(false);
    expect(router.currentRoute.value.name).toBe('accueil');
    expect(wrapper.text()).toContain('Se connecter');
  });

  it("déconnecte l'interface même si l'API ne répond pas", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Indisponible'));
    const { wrapper } = await monter();

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(useSessionStore().estConnecte).toBe(false);
  });
});
