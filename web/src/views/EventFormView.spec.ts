import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import type { EventDetail } from '../api/sorties';
import { gardeDeSession } from '../router/garde';
import EventFormView from './EventFormView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/interests', () => ({ fetchInterests: vi.fn() }));
vi.mock('../api/cities', () => ({ searchCities: vi.fn() }));
vi.mock('../api/sorties', () => ({ fetchEvent: vi.fn(), creerSortie: vi.fn(), modifierSortie: vi.fn() }));
const authApi = await import('../api/auth');
const interestsApi = await import('../api/interests');
const citiesApi = await import('../api/cities');
const sortiesApi = await import('../api/sorties');

const organisateur: Me = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'marcel@example.test',
  role: 'organizer',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Marcel',
};
const ID = '11111111-1111-1111-1111-111111111111';
const TOULOUSE = { cityName: 'Toulouse', postalCodes: ['31000', '31100'], departmentCode: '31', cityCode: '31555' };

function sortie(surcharge: Partial<EventDetail> = {}): EventDetail {
  return {
    id: ID,
    title: 'Balade au Jardin des Plantes',
    interest: { id: 2, slug: 'balade', label: 'Balade' },
    // 14 h 30 – 17 h à Paris.
    startsAt: '2099-11-14T13:30:00.000Z',
    endsAt: '2099-11-14T16:00:00.000Z',
    location: { cityName: 'Toulouse', departmentCode: '31' },
    status: 'draft',
    isPast: false,
    capacity: 12,
    availablePlaces: 12,
    organizer: { userId: organisateur.id, displayName: 'Marcel', isOrganizer: true },
    myRegistration: null,
    description: 'Une promenade tranquille, suivie d’un thé au kiosque.',
    areaHint: 'Près du kiosque',
    exactAddress: '2 allée Jules-Guesde',
    cancellationReason: null,
    canRegister: false,
    registrationBlockedReason: 'Vous organisez cette sortie.',
    isOrganizer: true,
    ...surcharge,
  };
}

let router: Router;
type Monte = Awaited<ReturnType<typeof monter>>;

async function monter(chemin: string) {
  const vide = { render: () => h('div') };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mes-sorties', name: 'mes-sorties', component: vide },
      { path: '/sorties/nouvelle', name: 'nouvelle-sortie', component: EventFormView, meta: { connexionRequise: true } },
      { path: '/sorties/:eventId/modifier', name: 'modifier-sortie', component: EventFormView, meta: { connexionRequise: true } },
      { path: '/sorties/:eventId', name: 'sortie', component: vide },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

async function remplirSansLieu(w: Monte) {
  await w.get('#sortie-titre').setValue('Balade au Jardin des Plantes');
  await w.get('#sortie-description').setValue('Une promenade tranquille, suivie d’un thé au kiosque.');
  await w.get('#sortie-interet').setValue('2');
  await w.get('#sortie-date').setValue('2099-11-14');
  await w.get('#sortie-heure-debut').setValue('14:30');
  await w.get('#sortie-heure-fin').setValue('17:00');
  await w.get('#sortie-repere').setValue('Près du kiosque');
  await w.get('#sortie-adresse').setValue('2 allée Jules-Guesde');
  await w.get('#sortie-capacite').setValue('12');
}

async function soumettre(w: Monte) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

const resume = (w: Monte) => w.get('.resume-erreurs');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur });
  vi.mocked(interestsApi.fetchInterests).mockResolvedValue([
    { id: 1, slug: 'jardinage', label: 'Jardinage' },
    { id: 2, slug: 'balade', label: 'Balade' },
  ]);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('créer une sortie', () => {
  it("réservé aux organisateurs : explication, aucun appel à l'API", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur, role: 'member' });
    const wrapper = await monter('/sorties/nouvelle');

    expect(wrapper.get('#titre-formulaire-refus').text()).toBe('Création impossible');
    expect(wrapper.text()).toContain('Seuls les organisateurs peuvent créer des sorties');
    expect(interestsApi.fetchInterests).not.toHaveBeenCalled();
  });

  it('formulaire vide : résumé des erreurs focalisé, liens vers chaque champ, rien envoyé', async () => {
    const wrapper = await monter('/sorties/nouvelle');
    await soumettre(wrapper);

    expect(sortiesApi.creerSortie).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(resume(wrapper).element);
    expect(resume(wrapper).text()).toContain('Le formulaire contient 10 erreurs');
    expect(wrapper.get('#sortie-titre').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#sortie-titre').attributes('aria-describedby')).toContain('sortie-titre-erreur');

    await resume(wrapper).get('a').trigger('click');
    expect(document.activeElement?.id).toBe('sortie-titre');
  });

  it('refuse une sortie dans le passé et une fin avant le début', async () => {
    const wrapper = await monter('/sorties/nouvelle');
    await remplirSansLieu(wrapper);
    await wrapper.get('#sortie-date').setValue('2020-01-10');
    await wrapper.get('#sortie-heure-fin').setValue('10:00');
    await soumettre(wrapper);

    expect(wrapper.get('#sortie-date-erreur').text()).toBe('La sortie doit avoir lieu dans le futur.');
    expect(wrapper.get('#sortie-heure-fin-erreur').text()).toBe("L'heure de fin doit être après l'heure de début.");
  });

  it('commune choisie dans la recherche : lieu vérifié, heure de Paris, brouillon puis fiche', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(citiesApi.searchCities).mockResolvedValue([TOULOUSE]);
    vi.mocked(sortiesApi.creerSortie).mockResolvedValue(sortie());
    const wrapper = await monter('/sorties/nouvelle');
    await remplirSansLieu(wrapper);

    await wrapper.get('#sortie-ville').setValue('toul');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(citiesApi.searchCities).toHaveBeenCalledWith('toul');
    await wrapper.get('.suggestions-communes button').trigger('click');
    expect((wrapper.get('#sortie-code-postal').element as HTMLInputElement).value).toBe('31000');

    const navigation = vi.spyOn(router, 'push');
    await soumettre(wrapper);

    expect(sortiesApi.creerSortie).toHaveBeenCalledWith({
      title: 'Balade au Jardin des Plantes',
      description: 'Une promenade tranquille, suivie d’un thé au kiosque.',
      interestId: 2,
      startsAt: '2099-11-14T13:30:00.000Z',
      endsAt: '2099-11-14T16:00:00.000Z',
      location: { cityName: 'Toulouse', postalCode: '31000', departmentCode: '31', cityCode: '31555', verified: true },
      areaHint: 'Près du kiosque',
      exactAddress: '2 allée Jules-Guesde',
      capacity: 12,
    });
    expect(navigation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sortie',
        params: { eventId: ID },
        state: { annonce: 'Le brouillon « Balade au Jardin des Plantes » est enregistré. Publiez-le quand il est prêt.' },
      }),
    );
  });

  it('recherche de communes en panne : saisie manuelle, lieu non vérifié', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(citiesApi.searchCities).mockRejectedValue(new ApiError(503, 'CITY_LOOKUP_UNAVAILABLE', 'Indisponible'));
    vi.mocked(sortiesApi.creerSortie).mockResolvedValue(sortie());
    const wrapper = await monter('/sorties/nouvelle');
    await remplirSansLieu(wrapper);

    await wrapper.get('#sortie-ville').setValue('Toulouse');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(wrapper.text()).toContain('Recherche indisponible ou sans résultat');
    await wrapper.get('#sortie-code-postal').setValue('31400');
    await wrapper.get('#sortie-departement').setValue('31');
    await soumettre(wrapper);

    expect(vi.mocked(sortiesApi.creerSortie).mock.calls[0][0].location).toEqual({
      cityName: 'Toulouse',
      postalCode: '31400',
      departmentCode: '31',
      cityCode: null,
      verified: false,
    });
  });

  it("refus de l'API : champ désigné par details, sinon message en tête", async () => {
    vi.mocked(sortiesApi.creerSortie)
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDATION_FAILED', 'Certaines informations sont manquantes ou invalides.', [
          { field: 'location.postalCode', messages: ['postalCode must match /^\\d{5}$/'] },
        ]),
      )
      .mockRejectedValueOnce(new ApiError(403, 'ROLE_REQUIRED', "Vous n'avez pas le rôle requis pour effectuer cette action."));
    const wrapper = await monter('/sorties/nouvelle');
    await remplirSansLieu(wrapper);
    await wrapper.get('.lien-bouton').trigger('click');
    await wrapper.get('#sortie-ville').setValue('Toulouse');
    await wrapper.get('#sortie-code-postal').setValue('31000');
    await wrapper.get('#sortie-departement').setValue('31');

    await soumettre(wrapper);
    // Message général et détail de l'API affichés mot pour mot (critère « telles quelles »).
    expect(resume(wrapper).text()).toContain('Certaines informations sont manquantes ou invalides.');
    expect(wrapper.get('#sortie-code-postal-erreur').text()).toBe('postalCode must match /^\\d{5}$/');
    await resume(wrapper).get('a').trigger('click');
    expect(document.activeElement?.id).toBe('sortie-code-postal');

    await soumettre(wrapper);
    expect(resume(wrapper).text()).toBe("Vous n'avez pas le rôle requis pour effectuer cette action.");
    expect(document.activeElement).toBe(resume(wrapper).element);
  });
});

describe('modifier une sortie', () => {
  it("pré-remplit à l'heure de Paris et n'envoie que le champ changé", async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
    vi.mocked(sortiesApi.modifierSortie).mockResolvedValue(sortie({ title: 'Grande balade' }));
    const wrapper = await monter(`/sorties/${ID}/modifier`);

    const valeur = (id: string) => (wrapper.get(id).element as HTMLInputElement).value;
    expect(valeur('#sortie-date')).toBe('2099-11-14');
    expect(valeur('#sortie-heure-debut')).toBe('14:30');
    expect(valeur('#sortie-heure-fin')).toBe('17:00');
    // Lieu actuel affiché ; pas de champ tant qu'on ne demande pas à le changer.
    expect(wrapper.text()).toContain('Lieu actuel : Toulouse (31)');
    expect(wrapper.find('#sortie-ville').exists()).toBe(false);

    await wrapper.get('#sortie-titre').setValue('Grande balade');
    const navigation = vi.spyOn(router, 'push');
    await soumettre(wrapper);

    expect(sortiesApi.modifierSortie).toHaveBeenCalledWith(ID, { title: 'Grande balade' });
    expect(navigation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sortie', state: { annonce: 'Vos modifications sont enregistrées.' } }),
    );
  });

  it("sans changement : aucun appel, et l'annonce le dit", async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
    const wrapper = await monter(`/sorties/${ID}/modifier`);
    const navigation = vi.spyOn(router, 'push');
    await soumettre(wrapper);

    expect(sortiesApi.modifierSortie).not.toHaveBeenCalled();
    expect(navigation).toHaveBeenCalledWith(expect.objectContaining({ state: { annonce: 'Aucune modification à enregistrer.' } }));
  });

  it('changer la ville : le nouveau lieu complet est envoyé', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
    vi.mocked(sortiesApi.modifierSortie).mockResolvedValue(sortie());
    const wrapper = await monter(`/sorties/${ID}/modifier`);

    await wrapper.get('.groupe .bouton--secondaire').trigger('click');
    await flushPromises();
    expect(document.activeElement?.id).toBe('sortie-ville');
    await wrapper.get('.lien-bouton').trigger('click');
    await wrapper.get('#sortie-ville').setValue('Blagnac');
    await wrapper.get('#sortie-code-postal').setValue('31700');
    await wrapper.get('#sortie-departement').setValue('31');
    await soumettre(wrapper);

    expect(sortiesApi.modifierSortie).toHaveBeenCalledWith(ID, {
      location: { cityName: 'Blagnac', postalCode: '31700', departmentCode: '31', cityCode: null, verified: false },
    });
  });

  it('avec des inscrits : date, lieu et thème figés, places au moins égales aux inscrits', async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'published', availablePlaces: 7 }));
    vi.mocked(sortiesApi.modifierSortie).mockResolvedValue(sortie());
    const wrapper = await monter(`/sorties/${ID}/modifier`);

    expect(wrapper.text()).toContain('5 personnes sont inscrites');
    for (const id of ['#sortie-date', '#sortie-heure-debut', '#sortie-interet', '#sortie-adresse']) {
      expect(wrapper.get(id).attributes('disabled')).toBeDefined();
    }
    expect(wrapper.find('.groupe .bouton--secondaire').exists()).toBe(false);

    await wrapper.get('#sortie-capacite').setValue('4');
    await soumettre(wrapper);
    expect(wrapper.get('#sortie-capacite-erreur').text()).toBe('Entre 5 (personnes déjà inscrites) et 50.');

    await wrapper.get('#sortie-capacite').setValue('20');
    await soumettre(wrapper);
    expect(sortiesApi.modifierSortie).toHaveBeenCalledWith(ID, { capacity: 20 });
  });

  it.each([
    ['annulée', { status: 'cancelled' as const }, 'Cette sortie ne peut plus être modifiée'],
    ['commencée', { status: 'published' as const, isPast: true }, 'Cette sortie ne peut plus être modifiée'],
    ["organisée par quelqu'un d'autre", { isOrganizer: false }, 'que les sorties que vous organisez'],
  ])('sortie %s : modification refusée avec explication', async (_cas, surcharge, texte) => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie(surcharge));
    const wrapper = await monter(`/sorties/${ID}/modifier`);

    expect(wrapper.get('#titre-formulaire-refus').text()).toBe('Modification impossible');
    expect(wrapper.text()).toContain(texte);
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
