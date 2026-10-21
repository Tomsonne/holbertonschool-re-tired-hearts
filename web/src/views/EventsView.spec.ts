import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import type { EventDetail, EventSummary } from '../api/sorties';
import { gardeDeSession } from '../router/garde';
import { useSessionStore } from '../stores/session';
import EventsView from './EventsView.vue';
import EventView from './EventView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/interests', () => ({ fetchInterests: vi.fn() }));
vi.mock('../api/sorties', () => ({ fetchEvents: vi.fn(), fetchEvent: vi.fn(), inscrire: vi.fn(), desinscrire: vi.fn() }));
const authApi = await import('../api/auth');
const interestsApi = await import('../api/interests');
const sortiesApi = await import('../api/sorties');

const visiteur: Me = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'odette@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Odette',
};

const ID = '11111111-1111-1111-1111-111111111111';

function resume(n: number, surcharge: Partial<EventSummary> = {}): EventSummary {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    title: `Sortie ${n}`,
    interest: { id: 1, slug: 'balade', label: 'Balade' },
    // 14 h 30 – 17 h à Paris.
    startsAt: '2026-11-14T13:30:00.000Z',
    endsAt: '2026-11-14T16:00:00.000Z',
    location: { cityName: 'Toulouse', departmentCode: '31' },
    status: 'published',
    isPast: false,
    capacity: 12,
    availablePlaces: 4,
    organizer: { userId: '22222222-2222-2222-2222-222222222222', displayName: 'Marcel', isOrganizer: true },
    myRegistration: null,
    ...surcharge,
  };
}

function detail(surcharge: Partial<EventDetail> = {}): EventDetail {
  return {
    ...resume(1, { id: ID, title: 'Balade au Jardin des Plantes' }),
    description: 'Une promenade tranquille, suivie d’un thé.',
    areaHint: 'Près de l’entrée principale',
    exactAddress: null,
    cancellationReason: null,
    canRegister: true,
    registrationBlockedReason: null,
    isOrganizer: false,
    ...surcharge,
  };
}

const page = (items: EventSummary[], total = items.length): Page<EventSummary> => ({ items, page: 1, pageSize: 12, total });

let router: Router;
const lu = (w: { text(): string }) => w.text().replace(/\s+/g, ' ').trim();
// Une liste de définitions lue comme un lecteur d'écran : « intitulé : valeur ».
const fiche = (w: { findAll(s: string): { text(): string }[] }) => {
  const dt = w.findAll('dt').map(lu);
  const dd = w.findAll('dd').map(lu);
  return Object.fromEntries(dt.map((t, i) => [t, dd[i]]));
};
const boutons = (w: { findAll(s: string): { text(): string }[] }) => w.findAll('button').map((b) => b.text());

async function monter(chemin: string) {
  const vide = { render: () => h('div') };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres/:userId', name: 'membre', component: vide },
      { path: '/sorties', name: 'sorties', component: EventsView, meta: { connexionRequise: true } },
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
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur });
  vi.mocked(interestsApi.fetchInterests).mockResolvedValue([
    { id: 1, slug: 'balade', label: 'Balade' },
    { id: 2, slug: 'jardinage', label: 'Jardinage' },
  ]);
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('liste des sorties', () => {
  it('annonce la recherche en cours', async () => {
    vi.mocked(sortiesApi.fetchEvents).mockReturnValue(new Promise(() => {}));
    const wrapper = await monter('/sorties');

    expect(wrapper.get('.resultats [role="status"]').text()).toBe('Recherche des sorties…');
  });

  it("affiche l'erreur et recharge avec « Réessayer »", async () => {
    vi.mocked(sortiesApi.fetchEvents)
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Le service est momentanément indisponible.'))
      .mockResolvedValueOnce(page([resume(1)]));
    const wrapper = await monter('/sorties');

    const alerte = wrapper.get('[role="alert"]');
    expect(alerte.text()).toContain('Le service est momentanément indisponible.');
    await alerte.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.carte-sortie')).toHaveLength(1);
  });

  it('aucune sortie : le dit, et propose d’effacer les filtres quand il y en a', async () => {
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([]));
    const wrapper = await monter('/sorties?interet=2&departement=31');

    const message = wrapper.get('.resultats [role="status"]');
    expect(lu(message)).toContain('Aucune sortie à venir ne correspond à votre recherche pour « Jardinage » dans le département 31.');
    await message.get('button').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/sorties');
    expect(lu(wrapper.get('.resultats [role="status"]'))).toBe("Aucune sortie n'est prévue pour le moment. Revenez bientôt !");
  });

  it('carte : date, ville, organisateur, places restantes et statut, sans donnée privée', async () => {
    const avecFuite = {
      ...resume(1, { title: 'Pique-nique', myRegistration: 'registered' }),
      location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31400', cityCode: '31555' },
      exactAddress: '12 rue Secrète',
    } as EventSummary;
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([avecFuite, resume(2, { availablePlaces: 0 })]));
    const wrapper = await monter('/sorties');

    const [ouverte, complete] = wrapper.findAll('.carte-sortie');
    expect(ouverte.get('h4 a').attributes('href')).toBe(`/sorties/${avecFuite.id}`);
    expect(fiche(ouverte)).toEqual({
      Date: 'Samedi 14 novembre 2026, de 14 h 30 à 17 h',
      Lieu: 'Toulouse (31)',
      'Organisée par': 'Marcel',
      Places: '4 places restantes sur 12',
    });
    expect(ouverte.get('time').attributes('datetime')).toBe('2026-11-14T13:30:00.000Z');
    expect(ouverte.get('.badge').text()).toBe('Places disponibles');
    expect(ouverte.text()).toContain('Vous êtes inscrit');

    expect(complete.get('.badge').text()).toBe('Complet');
    expect(lu(complete)).toContain('Aucune place restante sur 12');
    expect(complete.text()).not.toContain('Vous êtes inscrit');

    expect(wrapper.text()).not.toMatch(/31400|31555|rue Secrète/);
  });

  it("lit les filtres dans l'adresse et refuse un département invalide", async () => {
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([resume(1)], 30));
    const wrapper = await monter('/sorties?interet=2&departement=2a&page=2');

    expect(sortiesApi.fetchEvents).toHaveBeenCalledWith({ interestId: 2, departmentCode: '2A', page: 2 });
    expect((wrapper.get('#filtre-sorties-interet').element as HTMLSelectElement).value).toBe('2');

    await wrapper.get('#filtre-sorties-departement').setValue('Haute-Garonne');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('#filtre-sorties-departement-erreur').text()).toContain('par exemple 31');
    expect(document.activeElement?.id).toBe('filtre-sorties-departement');
    expect(router.currentRoute.value.query.departement).toBe('2a');
  });

  it("une réponse arrivée en retard n'écrase pas la recherche la plus récente", async () => {
    let repondreLente!: (p: Page<EventSummary>) => void;
    vi.mocked(sortiesApi.fetchEvents)
      .mockReturnValueOnce(new Promise((r) => (repondreLente = r)))
      .mockResolvedValueOnce(page([resume(2, { title: 'Récente' })]));
    const wrapper = await monter('/sorties');

    await router.push('/sorties?departement=31');
    await flushPromises();
    repondreLente(page([resume(1, { title: 'Ancienne' })]));
    await flushPromises();

    expect(wrapper.findAll('.carte-sortie h4').map((h) => h.text())).toEqual(['Récente']);
  });

  it("référentiel des centres d'intérêt en échec : filtre désactivé, expliqué, sorties affichées", async () => {
    vi.mocked(interestsApi.fetchInterests)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Indisponible'))
      .mockResolvedValueOnce([{ id: 1, slug: 'balade', label: 'Balade' }]);
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([resume(1)]));
    const wrapper = await monter('/sorties');

    expect(wrapper.get('#filtre-sorties-interet').attributes('disabled')).toBeDefined();
    expect(wrapper.get('#filtre-sorties-interet-erreur').text()).toContain('ce filtre est indisponible');
    expect(wrapper.findAll('.carte-sortie')).toHaveLength(1);

    await wrapper.get('#filtre-sorties-interet-erreur button').trigger('click');
    await flushPromises();
    expect(wrapper.find('#filtre-sorties-interet').attributes('disabled')).toBeUndefined();
    expect(wrapper.findAll('#filtre-sorties-interet option').map((o) => o.text())).toContain('Balade');
  });

  it('profil en attente : la liste est visible, avec une explication pour s’inscrire', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur, profileStatus: 'pending' });
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([resume(1)]));
    const wrapper = await monter('/sorties');

    expect(wrapper.findAll('.carte-sortie')).toHaveLength(1);
    expect(wrapper.get('.message--info').text()).toContain('Pour vous inscrire, votre profil doit d\'abord être approuvé');
  });

  it("profil bloqué depuis la connexion : l'écran l'explique et met la session à jour", async () => {
    vi.mocked(sortiesApi.fetchEvents).mockRejectedValue(
      new ApiError(403, 'PROFILE_BLOCKED', 'Ce profil ne peut pas utiliser cette fonctionnalité.'),
    );
    const wrapper = await monter('/sorties');

    expect(wrapper.get('#titre-sorties-inaccessibles').text()).toBe('Sorties non disponibles');
    expect(wrapper.text()).toContain('Votre profil est bloqué par la modération');
    expect(useSessionStore().peutVoirSorties).toBe(false);
  });

  it("compte suspendu : rien n'est demandé à l'API", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur, accountStatus: 'suspended' });
    const wrapper = await monter('/sorties');

    expect(wrapper.text()).toContain('Votre compte est suspendu');
    expect(sortiesApi.fetchEvents).not.toHaveBeenCalled();
  });
});

describe("détail d'une sortie", () => {
  it('affiche les informations publiques, le texte saisi restant du texte', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      detail({ description: '<img src=x onerror="alert(1)"> Venez nombreux' }),
    );
    const wrapper = await monter(`/sorties/${ID}`);

    expect(sortiesApi.fetchEvent).toHaveBeenCalledWith(ID);
    expect(wrapper.get('h2').text()).toBe('Balade au Jardin des Plantes');
    expect(fiche(wrapper.get('.fiche'))).toEqual({
      Date: 'Samedi 14 novembre 2026, de 14 h 30 à 17 h',
      Lieu: 'Toulouse (31) Près de l’entrée principale',
      'Adresse exacte': 'Communiquée uniquement aux personnes inscrites.',
      'Organisée par': 'Marcel',
      Places: '4 places restantes sur 12',
    });
    expect(wrapper.get('.fiche a').attributes('href')).toBe('/membres/22222222-2222-2222-2222-222222222222');
    expect(wrapper.find('.fiche-sortie__description img').exists()).toBe(false);
    expect(wrapper.get('.fiche-sortie__description').text()).toContain('<img');
    expect(document.title).toBe('Balade au Jardin des Plantes — Re-Tired Hearts');
  });

  it('sortie inconnue, brouillon ou annulée pour autrui : « Sortie indisponible »', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockRejectedValue(new ApiError(404, 'EVENT_NOT_FOUND', "Cette sortie n'est pas disponible."));
    const wrapper = await monter(`/sorties/${ID}`);

    expect(wrapper.get('h2').text()).toBe('Sortie indisponible');
    expect(wrapper.get('section a').attributes('href')).toBe('/sorties');
  });

  it("affiche l'erreur de chargement et permet de réessayer", async () => {
    vi.mocked(sortiesApi.fetchEvent)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Le service est momentanément indisponible.'))
      .mockResolvedValueOnce(detail());
    const wrapper = await monter(`/sorties/${ID}`);

    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Balade au Jardin des Plantes');
  });

  it("inscription : retour visible, focus sur le message, adresse exacte affichée", async () => {
    vi.mocked(sortiesApi.fetchEvent)
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({ myRegistration: 'registered', availablePlaces: 3, canRegister: false, exactAddress: '2 allée Jules-Guesde' }),
      );
    vi.mocked(sortiesApi.inscrire).mockResolvedValue({ status: 'registered', availablePlaces: 3 });
    const wrapper = await monter(`/sorties/${ID}`);

    await wrapper.get('.inscription-sortie button').trigger('click');
    await flushPromises();

    expect(sortiesApi.inscrire).toHaveBeenCalledWith(ID);
    const message = wrapper.get('.inscription-sortie [role="status"]');
    expect(message.text()).toContain('Vous êtes inscrit à « Balade au Jardin des Plantes »');
    expect(document.activeElement).toBe(message.element);
    expect(wrapper.get('#titre-bandeau-sortie').text()).toBe('Vous êtes inscrit');
    expect(wrapper.text()).toContain('2 allée Jules-Guesde');
    expect(wrapper.text()).toContain('3 places restantes sur 12');
    expect(boutons(wrapper.get('.inscription-sortie'))).toEqual(['Me désinscrire']);
  });

  it("sortie devenue complète entre-temps : le message de l'API est lu et l'écran se met à jour", async () => {
    vi.mocked(sortiesApi.fetchEvent)
      .mockResolvedValueOnce(detail({ availablePlaces: 1 }))
      .mockResolvedValueOnce(
        detail({ availablePlaces: 0, canRegister: false, registrationBlockedReason: 'Cette sortie est complète.' }),
      );
    vi.mocked(sortiesApi.inscrire).mockRejectedValue(new ApiError(409, 'EVENT_FULL', 'Cette sortie est complète.'));
    const wrapper = await monter(`/sorties/${ID}`);

    await wrapper.get('.inscription-sortie button').trigger('click');
    await flushPromises();

    const alerte = wrapper.get('.inscription-sortie [role="alert"]');
    expect(alerte.text()).toBe('Cette sortie est complète.');
    expect(document.activeElement).toBe(alerte.element);
    expect(wrapper.get('#titre-bandeau-sortie').text()).toBe('Sortie complète');
    expect(wrapper.find('.inscription-sortie button').exists()).toBe(false);
  });

  it('désinscription : confirmation nommant la sortie, puis place libérée et adresse masquée', async () => {
    const inscrit = detail({ myRegistration: 'registered', availablePlaces: 3, canRegister: false, exactAddress: '2 allée Jules-Guesde' });
    vi.mocked(sortiesApi.fetchEvent)
      .mockResolvedValueOnce(inscrit)
      .mockResolvedValueOnce(detail({ myRegistration: 'withdrawn', availablePlaces: 4 }));
    vi.mocked(sortiesApi.desinscrire).mockResolvedValue({ status: 'withdrawn', availablePlaces: 4 });
    const wrapper = await monter(`/sorties/${ID}`);

    // Premier clic : rien n'est envoyé, on demande confirmation.
    await wrapper.get('.inscription-sortie button').trigger('click');
    await flushPromises();
    const confirmation = wrapper.get('.confirmation');
    expect(confirmation.text()).toContain('Voulez-vous vraiment vous désinscrire de « Balade au Jardin des Plantes » ?');
    expect(document.activeElement).toBe(confirmation.element);
    expect(sortiesApi.desinscrire).not.toHaveBeenCalled();

    // « Non » : retour au bouton de départ.
    await wrapper.get('.confirmation .bouton--secondaire').trigger('click');
    await flushPromises();
    expect(document.activeElement?.textContent?.trim()).toBe('Me désinscrire');

    // « Oui » : désinscription.
    await wrapper.get('.inscription-sortie button').trigger('click');
    await flushPromises();
    await wrapper.get('.confirmation .bouton:not(.bouton--secondaire)').trigger('click');
    await flushPromises();

    expect(sortiesApi.desinscrire).toHaveBeenCalledWith(ID);
    expect(wrapper.get('.inscription-sortie [role="status"]').text()).toContain('Vous n\'êtes plus inscrit');
    expect(wrapper.text()).not.toContain('2 allée Jules-Guesde');
    expect(wrapper.text()).toContain('4 places restantes sur 12');
    expect(boutons(wrapper.get('.inscription-sortie'))).toEqual(['M’inscrire à cette sortie']);
  });

  it('sortie annulée : bandeau explicite avec le motif, inscriptions fermées', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      detail({
        status: 'cancelled',
        cancellationReason: 'Météo défavorable',
        myRegistration: 'registered',
        canRegister: false,
        registrationBlockedReason: 'Cette sortie ne prend plus d’inscriptions.',
      }),
    );
    const wrapper = await monter(`/sorties/${ID}`);

    const bandeau = wrapper.get('.bandeau-sortie');
    expect(bandeau.get('h3').text()).toBe('Sortie annulée');
    expect(bandeau.text()).toContain("Motif donné par l'organisateur : Météo défavorable");
    expect(wrapper.find('.inscription-sortie button').exists()).toBe(false);
    expect(wrapper.get('.inscription-sortie').text()).toContain('Les inscriptions sont fermées');
    expect(fiche(wrapper.get('.fiche')).Places).toBeUndefined();
  });

  it('sortie passée : bandeau « Sortie terminée », même si elle était complète', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      detail({ isPast: true, availablePlaces: 0, canRegister: false }),
    );
    const wrapper = await monter(`/sorties/${ID}`);

    expect(wrapper.get('#titre-bandeau-sortie').text()).toBe('Sortie terminée');
    expect(wrapper.find('.inscription-sortie button').exists()).toBe(false);
  });

  it("profil en attente : la raison donnée par l'API et un lien vers le profil", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur, profileStatus: 'pending' });
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      detail({ canRegister: false, registrationBlockedReason: 'Votre profil doit être approuvé.' }),
    );
    const wrapper = await monter(`/sorties/${ID}`);

    const zone = wrapper.get('.inscription-sortie');
    expect(zone.text()).toContain('Votre profil doit être approuvé.');
    expect(zone.get('a').attributes('href')).toBe('/mon-profil');
    // Un profil en attente ne peut pas ouvrir la fiche d'un membre : pas de lien vers l'organisateur.
    expect(wrapper.find('.fiche a').exists()).toBe(false);
  });

  it("organisateur : « Vous », pas de bouton, l'adresse exacte reste visible", async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      detail({
        isOrganizer: true,
        canRegister: false,
        registrationBlockedReason: 'Vous organisez cette sortie.',
        exactAddress: '2 allée Jules-Guesde',
      }),
    );
    const wrapper = await monter(`/sorties/${ID}`);

    expect(fiche(wrapper.get('.fiche'))['Organisée par']).toBe('Vous');
    expect(wrapper.text()).toContain('2 allée Jules-Guesde');
    expect(wrapper.get('.inscription-sortie').text()).toContain('Vous organisez cette sortie.');
    expect(wrapper.find('.inscription-sortie button').exists()).toBe(false);
  });

  it('le lien de retour ramène à la liste avec ses filtres', async () => {
    vi.mocked(sortiesApi.fetchEvents).mockResolvedValue(page([resume(1, { id: ID })]));
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(detail());
    const wrapper = await monter('/sorties?interet=1');

    expect(wrapper.get('.carte-sortie h4 a').attributes('href')).toBe(`/sorties/${ID}?interet=1`);
    await wrapper.get('.carte-sortie h4 a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('sortie');

    expect(wrapper.get('.lien-retour a').attributes('href')).toBe('/sorties?interet=1');
  });

  it("fiche ouverte directement : le retour garde les filtres valides de l'adresse, rien d'autre", async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(detail());
    const wrapper = await monter(`/sorties/${ID}?departement=31&page=//evil.example&interet=1e3`);

    expect(wrapper.get('.lien-retour a').attributes('href')).toBe('/sorties?departement=31');
  });
});
