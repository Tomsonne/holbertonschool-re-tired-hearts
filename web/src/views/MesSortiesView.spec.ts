import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import type { EventDetail, EventSummary } from '../api/sorties';
import { gardeDeSession } from '../router/garde';
import EventView from './EventView.vue';
import MesSortiesView from './MesSortiesView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/sorties', () => ({ fetchMesSorties: vi.fn(), fetchEvent: vi.fn() }));
const authApi = await import('../api/auth');
const sortiesApi = await import('../api/sorties');

const organisateur: Me = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'marcel@example.test',
  role: 'organizer',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Marcel',
};

function sortie(n: number, surcharge: Partial<EventSummary> = {}): EventSummary {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title: `Sortie ${n}`,
    interest: { id: 1, slug: 'balade', label: 'Balade' },
    startsAt: '2099-11-14T13:30:00.000Z',
    endsAt: '2099-11-14T16:00:00.000Z',
    location: { cityName: 'Toulouse', departmentCode: '31' },
    status: 'published',
    isPast: false,
    capacity: 12,
    availablePlaces: 4,
    organizer: { userId: organisateur.id, displayName: 'Marcel', isOrganizer: true },
    myRegistration: null,
    ...surcharge,
  };
}

let router: Router;
const titres = (w: { findAll(s: string): { text(): string }[] }) => w.findAll('h3').map((t) => t.text());
const cartes = (w: { get(s: string): { findAll(s: string): { text(): string }[] } }, groupe: string) =>
  w.get(`[aria-labelledby="groupe-${groupe}"]`).findAll('.carte-sortie h4').map((t) => t.text());

async function monter(chemin = '/mes-sorties') {
  const vide = { render: () => h('div') };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres/:userId', name: 'membre', component: vide },
      { path: '/sorties', name: 'sorties', component: vide },
      { path: '/mes-sorties', name: 'mes-sorties', component: MesSortiesView, meta: { connexionRequise: true } },
      { path: '/sorties/:eventId', name: 'sortie', component: EventView, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('« Mes sorties »', () => {
  it('regroupe les sorties par statut, ce qui demande une action en premier', async () => {
    vi.mocked(sortiesApi.fetchMesSorties).mockResolvedValue([
      // Ordre de l'API : début le plus lointain d'abord.
      sortie(1, { title: 'Pique-nique de juin', startsAt: '2099-06-01T10:00:00.000Z' }),
      sortie(2, { title: 'Brouillon d’automne', status: 'draft', startsAt: '2099-10-01T10:00:00.000Z' }),
      sortie(3, { title: 'Balade de mars', startsAt: '2099-03-01T10:00:00.000Z' }),
      sortie(4, { title: 'Atelier passé', isPast: true, startsAt: '2020-03-01T10:00:00.000Z' }),
      sortie(5, { title: 'Concert clôturé', status: 'completed', isPast: true, startsAt: '2020-02-01T10:00:00.000Z' }),
      sortie(6, { title: 'Visite annulée', status: 'cancelled', startsAt: '2099-04-01T10:00:00.000Z' }),
    ]);
    const wrapper = await monter();

    expect(wrapper.get('[role="status"]').text()).toBe('Vous organisez 6 sorties.');
    expect(titres(wrapper)).toEqual([
      'Brouillons (1)',
      'À venir (2)',
      'Passées, à clôturer (1)',
      'Terminées (1)',
      'Annulées (1)',
    ]);
    // À venir : la plus proche d'abord.
    expect(cartes(wrapper, 'a-venir')).toEqual(['Balade de mars', 'Pique-nique de juin']);
    expect(cartes(wrapper, 'brouillons')).toEqual(['Brouillon d’automne']);
    expect(wrapper.get('[aria-labelledby="groupe-brouillons"] .badge').text()).toBe('Brouillon');
    // Publiée mais passée : pour l'organisateur, c'est une action à faire, pas une sortie « Terminée ».
    expect(wrapper.get('[aria-labelledby="groupe-a-cloturer"] .badge').text()).toBe('À clôturer');
    // L'organisateur, c'est soi-même : la ligne est retirée.
    expect(wrapper.text()).not.toContain('Organisée par');
  });

  it('ouvre la fiche, dont le lien de retour ramène à « Mes sorties »', async () => {
    const brouillon = sortie(2, { status: 'draft' });
    vi.mocked(sortiesApi.fetchMesSorties).mockResolvedValue([brouillon]);
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue({
      ...brouillon,
      description: 'Une sortie de test assez longue.',
      areaHint: null,
      exactAddress: '2 allée Jules-Guesde',
      cancellationReason: null,
      canRegister: false,
      registrationBlockedReason: 'Vous organisez cette sortie.',
      isOrganizer: true,
    } as EventDetail);
    const wrapper = await monter();

    const lien = wrapper.get('.carte-sortie h4 a');
    expect(lien.attributes('href')).toBe(`/sorties/${brouillon.id}?depuis=mes-sorties`);
    await lien.trigger('click');
    await flushPromises();

    const retour = wrapper.get('.lien-retour a');
    expect(retour.text()).toBe('← Retour à mes sorties');
    expect(retour.attributes('href')).toBe('/mes-sorties');
  });

  it('aucune sortie : le dit simplement', async () => {
    vi.mocked(sortiesApi.fetchMesSorties).mockResolvedValue([]);
    const wrapper = await monter();

    expect(wrapper.get('[role="status"]').text()).toBe("Vous n'organisez encore aucune sortie.");
  });

  it('chargement puis erreur avec « Réessayer »', async () => {
    let echouer!: (e: unknown) => void;
    vi.mocked(sortiesApi.fetchMesSorties)
      .mockReturnValueOnce(new Promise((_r, rejeter) => (echouer = rejeter)))
      .mockResolvedValueOnce([sortie(1)]);
    const wrapper = await monter();
    expect(wrapper.get('[role="status"]').text()).toBe('Chargement de vos sorties…');

    echouer(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Le service est momentanément indisponible.'));
    await flushPromises();
    const alerte = wrapper.get('[role="alert"]');
    expect(alerte.text()).toContain('Le service est momentanément indisponible.');

    await alerte.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.carte-sortie')).toHaveLength(1);
  });

  it("membre sans rôle d'organisateur : explication, aucun appel à l'API", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur, role: 'member' });
    const wrapper = await monter();

    expect(wrapper.get('#titre-mes-sorties-refus').text()).toBe('Réservé aux organisateurs');
    expect(wrapper.text()).toContain("Le rôle d'organisateur est attribué par un modérateur");
    expect(sortiesApi.fetchMesSorties).not.toHaveBeenCalled();
  });

  it('organisateur au profil en attente : lien vers son profil', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur, profileStatus: 'pending' });
    const wrapper = await monter();

    expect(wrapper.text()).toContain('Votre profil doit être approuvé');
    expect(wrapper.get('section a').attributes('href')).toBe('/mon-profil');
    expect(sortiesApi.fetchMesSorties).not.toHaveBeenCalled();
  });

  it("rôle retiré depuis la connexion : le message de l'API est affiché", async () => {
    vi.mocked(sortiesApi.fetchMesSorties).mockRejectedValue(
      new ApiError(403, 'ROLE_REQUIRED', 'Seul un organisateur peut créer ou gérer ses sorties.'),
    );
    const wrapper = await monter();

    expect(wrapper.get('#titre-mes-sorties-refus').text()).toBe('Réservé aux organisateurs');
    expect(wrapper.text()).toContain('Seul un organisateur peut créer ou gérer ses sorties.');
  });
});
