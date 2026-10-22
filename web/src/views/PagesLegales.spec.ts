import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import App from '../App.vue';
import { ApiError } from '../api/http';
import { gardeDeSession } from '../router/garde';
import MentionsLegalesView from './MentionsLegalesView.vue';
import ViePriveeView from './ViePriveeView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
const authApi = await import('../api/auth');

let router: Router;

// L'application complète (en-tête, pied de page) avec un visiteur non connecté.
async function monter(chemin: string) {
  const vide = defineComponent({ render: () => h('div') });
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/inscription', name: 'inscription', component: vide },
      { path: '/vie-privee', name: 'vie-privee', component: ViePriveeView },
      { path: '/mentions-legales', name: 'mentions-legales', component: MentionsLegalesView },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('pages légales', () => {
  it('sont atteignables depuis le pied de page, sans être connecté', async () => {
    const wrapper = await monter('/');

    const liens = wrapper.get('footer nav[aria-label="Informations légales"]').findAll('a');
    expect(liens.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Vos données et votre vie privée', '/vie-privee'],
      ['Mentions légales', '/mentions-legales'],
    ]);

    await liens[0].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('vie-privee');
    expect(wrapper.get('main h2').text()).toBe('Vos données et votre vie privée');

    await wrapper.get('footer a[href="/mentions-legales"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('mentions-legales');
    expect(wrapper.get('main h2').text()).toBe('Mentions légales');
  });

  it('vie privée : chaque lien du sommaire mène à une section de la page', async () => {
    const wrapper = await monter('/vie-privee');

    const cibles = wrapper.findAll('.page-texte__sommaire a').map((a) => a.attributes('href'));
    expect(cibles).toHaveLength(7);
    for (const cible of cibles) {
      expect(wrapper.find(`section${cible}`).exists()).toBe(true);
    }
  });

  it('vie privée : dit ce qui est visible, ce qui reste privé et ce que voit la modération', async () => {
    const wrapper = await monter('/vie-privee');
    const texte = (id: string) => wrapper.get(`#${id}`).text().replace(/\s+/g, ' ');

    expect(texte('visible')).toContain('Toulouse (31)');
    expect(texte('prive')).toContain('adresse e-mail');
    expect(texte('prive')).toContain('code postal');
    expect(texte('messages')).toContain('Les modérateurs ne peuvent pas lire vos messages.');
    expect(texte('traitement')).toContain('2 heures');
    expect(wrapper.get('#choix a').attributes('href')).toBe('/mentions-legales');
  });

  it('mentions légales : projet étudiant, données fictives, renvoi vers la vie privée', async () => {
    const wrapper = await monter('/mentions-legales');
    const texte = wrapper.get('main').text().replace(/\s+/g, ' ');

    expect(texte).toContain('projet d\'étudiants');
    expect(texte).toContain('fictifs');
    expect(texte).toContain('Holberton School Toulouse');
    expect(wrapper.get('main a[href="/vie-privee"]').text()).toBe('Vos données et votre vie privée');
  });
});
