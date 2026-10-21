import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import { gardeDeSession } from '../router/garde';
import RegisterView from './RegisterView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
const authApi = await import('../api/auth');

const nouveauMembre: Me = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'jeanne@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'pending',
  displayName: 'Jeanne',
};

let router: Router;

async function monter() {
  const vide = { template: '<div />' };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide, meta: { invitesSeulement: true } },
      { path: '/inscription', name: 'inscription', component: RegisterView, meta: { invitesSeulement: true } },
      { path: '/mon-profil', name: 'mon-profil', component: vide, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push('/inscription');
  const wrapper = mount(RegisterView, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof monter>>;

async function remplirEtEnvoyer(wrapper: Wrapper, email: string, nom: string, motDePasse: string) {
  await wrapper.get('#inscription-email').setValue(email);
  await wrapper.get('#inscription-nom').setValue(nom);
  await wrapper.get('#inscription-mot-de-passe').setValue(motDePasse);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

describe("écran d'inscription", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it("relie chaque champ à son libellé et à son texte d'aide", async () => {
    const wrapper = await monter();

    expect(wrapper.get('label[for="inscription-nom"]').text()).toBe('Nom affiché');
    expect(wrapper.get('#inscription-nom').attributes('aria-describedby')).toBe('inscription-nom-aide');
    expect(wrapper.get('#inscription-nom-aide').text()).toContain('Évitez votre nom complet');
  });

  it("refuse un mot de passe trop court et un nom d'un caractère sans appeler l'API", async () => {
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, 'jeanne@example.test', 'J', 'court');

    const resume = wrapper.get('[role="alert"]');
    expect(resume.findAll('li')).toHaveLength(2);
    expect(document.activeElement).toBe(resume.element);
    expect(wrapper.get('#inscription-mot-de-passe-erreur').text()).toContain('au moins 12 caractères (actuellement 5)');
    expect(wrapper.get('#inscription-mot-de-passe').attributes('aria-describedby')).toBe(
      'inscription-mot-de-passe-aide inscription-mot-de-passe-erreur',
    );
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it("n'envoie que l'e-mail, le nom et le mot de passe (aucun rôle)", async () => {
    vi.mocked(authApi.register).mockResolvedValue(nouveauMembre);
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, '  jeanne@example.test ', ' Jeanne ', 'mon chat aime le jardin');

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'jeanne@example.test',
      displayName: 'Jeanne',
      password: 'mon chat aime le jardin',
    });
  });

  it('affiche le succès et la prochaine étape, avec le focus dessus', async () => {
    vi.mocked(authApi.register).mockResolvedValue(nouveauMembre);
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, nouveauMembre.email, 'Jeanne', 'mon chat aime le jardin');

    const succes = wrapper.get('.message--succes');
    expect(succes.text()).toContain('Bienvenue Jeanne');
    expect(succes.text()).toContain('complétez votre profil');
    expect(document.activeElement).toBe(succes.element);
    expect(wrapper.find('form').exists()).toBe(false);

    await succes.get('button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('mon-profil');
  });

  it("range l'e-mail déjà utilisé sous le bon champ, avec un lien vers la connexion", async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(409, 'EMAIL_ALREADY_USED', 'Cette adresse e-mail est déjà utilisée.'),
    );
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, 'odette@example.test', 'Odette', 'mon chat aime le jardin');

    const erreur = wrapper.get('#inscription-email-erreur');
    expect(erreur.text()).toContain('Un compte existe déjà');
    expect(erreur.find('a').attributes('href')).toBe('/connexion');
    expect(wrapper.get('#inscription-email').attributes('aria-invalid')).toBe('true');
  });

  it("rattache une erreur de validation de l'API au champ concerné", async () => {
    vi.mocked(authApi.register).mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Certaines informations sont manquantes ou invalides.', [
        { field: 'email', messages: ['email must be an email'] },
      ]),
    );
    const wrapper = await monter();

    await remplirEtEnvoyer(wrapper, 'jeanne@example.test', 'Jeanne', 'mon chat aime le jardin');

    expect(wrapper.get('#inscription-email-erreur').text()).toContain('adresse e-mail invalide');
    expect(wrapper.text()).not.toContain('must be');
  });
});
