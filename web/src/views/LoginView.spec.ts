import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import { gardeDeSession } from '../router/garde';
import LoginView from './LoginView.vue';

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

let router: Router;

async function monter(url = '/connexion') {
  const vide = { template: '<div />' };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: LoginView, meta: { invitesSeulement: true } },
      { path: '/inscription', name: 'inscription', component: vide, meta: { invitesSeulement: true } },
      { path: '/mon-profil', name: 'mon-profil', component: vide, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(url);
  // attachTo : nécessaire pour vérifier où se trouve le focus.
  const wrapper = mount(LoginView, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

async function remplirEtEnvoyer(wrapper: Awaited<ReturnType<typeof monter>>, email: string, motDePasse: string) {
  await wrapper.get('#connexion-email').setValue(email);
  await wrapper.get('#connexion-mot-de-passe').setValue(motDePasse);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

describe('écran de connexion', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    // Visiteur non connecté au départ.
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('affiche des libellés visibles reliés aux champs', async () => {
    const wrapper = await monter();

    expect(wrapper.get('label[for="connexion-email"]').text()).toBe('Adresse e-mail');
    expect(wrapper.get('label[for="connexion-mot-de-passe"]').text()).toBe('Mot de passe');
  });

  it("refuse un formulaire vide sans appeler l'API et place le focus sur le résumé", async () => {
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, '', '');

    const resume = wrapper.get('[role="alert"]');
    expect(resume.findAll('li')).toHaveLength(2);
    expect(document.activeElement).toBe(resume.element);
    expect(wrapper.get('#connexion-email').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#connexion-email').attributes('aria-describedby')).toBe('connexion-email-erreur');
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it("affiche le même message que l'e-mail soit inconnu ou le mot de passe faux", async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.'),
    );
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, 'inconnu@example.test', 'un-mot-de-passe-long');

    expect(wrapper.get('[role="alert"]').text()).toBe('Adresse e-mail ou mot de passe incorrect.');
    expect(router.currentRoute.value.name).toBe('connexion');
  });

  it('explique clairement un compte suspendu', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu.'));
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, membre.email, 'un-mot-de-passe-long');

    expect(wrapper.get('[role="alert"]').text()).toContain('suspendu');
  });

  it('ramène à la page demandée après la connexion', async () => {
    vi.mocked(authApi.login).mockResolvedValue(membre);
    const wrapper = await monter('/connexion?redirect=/mon-profil');

    await remplirEtEnvoyer(wrapper, membre.email, 'un-mot-de-passe-long');

    expect(authApi.login).toHaveBeenCalledWith({ email: membre.email, password: 'un-mot-de-passe-long' });
    expect(router.currentRoute.value.name).toBe('mon-profil');
  });

  it("ne suit pas un redirect vers un autre site", async () => {
    vi.mocked(authApi.login).mockResolvedValue(membre);
    const wrapper = await monter('/connexion?redirect=https://site-malveillant.example');

    await remplirEtEnvoyer(wrapper, membre.email, 'un-mot-de-passe-long');

    expect(router.currentRoute.value.name).toBe('accueil');
  });

  it('explique pourquoi on revient ici après une session expirée', async () => {
    const wrapper = await monter('/connexion?raison=session-expiree&redirect=/mon-profil');

    expect(wrapper.text()).toContain('Votre session a expiré, merci de vous reconnecter.');
  });

  it("désactive le bouton pendant l'envoi pour éviter les doubles connexions", async () => {
    let terminer!: (me: Me) => void;
    vi.mocked(authApi.login).mockReturnValue(new Promise((resolve) => (terminer = resolve)));
    const wrapper = await monter();

    await wrapper.get('#connexion-email').setValue(membre.email);
    await wrapper.get('#connexion-mot-de-passe').setValue('un-mot-de-passe-long');
    await wrapper.get('form').trigger('submit');

    const bouton = wrapper.get('button[type="submit"]');
    expect(bouton.attributes('disabled')).toBeDefined();
    expect(bouton.text()).toBe('Connexion en cours…');

    terminer(membre);
    await flushPromises();
  });
});
