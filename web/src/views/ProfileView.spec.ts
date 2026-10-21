import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { nextTick } from 'vue';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import type { Interest } from '../api/interests';
import type { OwnProfile } from '../api/profil';
import { gardeDeSession } from '../router/garde';
import { useSessionStore } from '../stores/session';
import ProfileView from './ProfileView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/interests', () => ({ fetchInterests: vi.fn() }));
vi.mock('../api/profil', () => ({ fetchMyProfile: vi.fn(), updateMyProfile: vi.fn() }));
vi.mock('../api/cities', () => ({ searchCities: vi.fn() }));
const authApi = await import('../api/auth');
const interestsApi = await import('../api/interests');
const profilApi = await import('../api/profil');
const citiesApi = await import('../api/cities');

const membre: Me = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'jeanne@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'pending',
  displayName: 'Jeanne',
};

const INTERETS: Interest[] = [
  { id: 1, slug: 'balade', label: 'Balade' },
  { id: 2, slug: 'jardinage', label: 'Jardinage' },
  { id: 3, slug: 'lecture', label: 'Lecture' },
];

// Profil tel que créé à l'inscription (R-PROF-1).
function profilVide(surcharge: Partial<OwnProfile> = {}): OwnProfile {
  return {
    userId: membre.id,
    displayName: 'Jeanne',
    bio: null,
    lookingFor: [],
    interests: [],
    location: null,
    isOrganizer: false,
    acceptsMessages: true,
    memberSince: '2026-10',
    discoverable: true,
    allowMessages: true,
    status: 'pending',
    isComplete: false,
    missingForApproval: ['location', 'interests'],
    ...surcharge,
  };
}

const profilApprouve = (surcharge: Partial<OwnProfile> = {}) =>
  profilVide({
    status: 'approved',
    interests: [INTERETS[1]],
    location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31000', cityCode: '31555', verified: true },
    isComplete: true,
    missingForApproval: [],
    ...surcharge,
  });

let router: Router;

async function monter() {
  const vide = { template: '<div />' };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide, meta: { invitesSeulement: true } },
      { path: '/mon-profil', name: 'mon-profil', component: ProfileView, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push('/mon-profil');
  const wrapper = mount(ProfileView, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof monter>>;

async function envoyer(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

function attenteControlee<T>() {
  let resoudre!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resoudre = resolve; });
  return { promise, resoudre };
}

async function demarrerRecherche(wrapper: Wrapper, ville: string) {
  await wrapper.get('#profil-ville').setValue(ville);
  vi.advanceTimersByTime(300);
  await nextTick();
}

async function finirReponse() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('écran « Mon profil »', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...membre });
    vi.mocked(interestsApi.fetchInterests).mockResolvedValue(INTERETS);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('les quatre états', () => {
    it('annonce le chargement', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockReturnValue(new Promise(() => {}));
      const wrapper = await monter();

      expect(wrapper.get('[role="status"]').text()).toBe('Chargement de votre profil…');
      expect(wrapper.find('form').exists()).toBe(false);
    });

    it("affiche l'erreur sans détail technique, puis recharge avec « Réessayer »", async () => {
      vi.mocked(profilApi.fetchMyProfile)
        .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Le service est momentanément indisponible.'))
        .mockResolvedValueOnce(profilVide());
      const wrapper = await monter();

      const alerte = wrapper.get('[role="alert"]');
      expect(alerte.text()).toContain("Votre profil n'a pas pu être chargé. Le service est momentanément indisponible.");
      await alerte.get('button').trigger('click');
      await flushPromises();

      expect(profilApi.fetchMyProfile).toHaveBeenCalledTimes(2);
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('accueille un profil vide et liste ce qui manque pour l’approbation', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
      const wrapper = await monter();

      expect(wrapper.text()).toContain("Votre profil n'est pas encore rempli");
      const bandeau = wrapper.get('.bandeau-profil');
      expect(bandeau.get('h3').text()).toBe('Profil en attente de vérification');
      expect(bandeau.findAll('li').map((li) => li.text())).toEqual([
        'votre ville et son département',
        "au moins un centre d'intérêt",
      ]);

      // Le lien mène au champ à remplir (ici, la première case des centres d'intérêt).
      await bandeau.findAll('a')[1].trigger('click');
      expect(document.activeElement).toBe(wrapper.get('#profil-interets input').element);
    });

    it("affiche le message d'enregistrement avec le focus dessus (succès)", async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve());
      vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilApprouve());
      const wrapper = await monter();

      await envoyer(wrapper);

      const succes = wrapper.get('.message--succes[role="status"]');
      expect(succes.text()).toBe('Vos modifications sont enregistrées.');
      expect(document.activeElement).toBe(succes.element);
    });
  });

  describe('bandeau selon le statut', () => {
    it('profil en attente et complet : la vérification est annoncée', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve({ status: 'pending' }));
      const wrapper = await monter();

      expect(wrapper.get('.bandeau-profil').text()).toContain('Votre profil est complet : un modérateur va le vérifier.');
      expect(wrapper.find('.bandeau-profil li').exists()).toBe(false);
    });

    it('profil approuvé mais masqué : le bandeau le rappelle', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve({ discoverable: false }));
      const wrapper = await monter();

      const bandeau = wrapper.get('.bandeau-profil');
      expect(bandeau.get('h3').text()).toBe('Profil approuvé');
      expect(bandeau.text()).toContain('ne pas apparaître dans la découverte');
    });

    it('profil bloqué : lecture seule, aucun formulaire ni bouton d’enregistrement', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve({ status: 'blocked' }));
      const wrapper = await monter();

      expect(wrapper.get('.bandeau-profil h3').text()).toBe('Profil bloqué');
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.find('input').exists()).toBe(false);
      expect(wrapper.get('.fiche').text()).toContain('Toulouse (31)');
      // R-LOC-2 : même en lecture seule, l'écran montre « Ville (département) », pas le code postal.
      expect(wrapper.get('.fiche').text()).not.toContain('31000');
    });
  });

  describe('enregistrement', () => {
    it('cas nominal : envoie intérêts, ville et confidentialité, sans rôle, statut ni e-mail', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
      vi.mocked(profilApi.updateMyProfile).mockImplementation(async (input) =>
        profilVide({
          displayName: input.displayName,
          interests: INTERETS.filter((i) => input.interestIds.includes(i.id)),
          location: input.location,
          discoverable: input.discoverable,
          allowMessages: input.allowMessages,
          isComplete: true,
          missingForApproval: [],
        }),
      );
      const wrapper = await monter();

      await wrapper.get('#profil-nom').setValue('  Jeanne R. ');
      await wrapper.get('input[value="romance"]').setValue(true);
      await wrapper.get('input[name="interestIds"][value="1"]').setValue(true);
      await wrapper.get('input[name="interestIds"][value="3"]').setValue(true);
      await wrapper.get('#profil-ville').setValue(' Toulouse ');
      await wrapper.get('#profil-code-postal').setValue('31000');
      await wrapper.get('#profil-departement').setValue('31');
      await wrapper.get('#profil-decouvrable').setValue(false);
      await wrapper.get('#profil-messages').setValue(false);
      expect(wrapper.text()).toContain('« Toulouse (31) »');
      await envoyer(wrapper);

      expect(profilApi.updateMyProfile).toHaveBeenCalledWith({
        displayName: 'Jeanne R.',
        bio: null,
        lookingFor: ['romance'],
        interestIds: [1, 3],
        // Saisie manuelle : non vérifiée et sans code INSEE (R-LOC-3).
        location: { cityName: 'Toulouse', postalCode: '31000', departmentCode: '31', cityCode: null, verified: false },
        discoverable: false,
        allowMessages: false,
      });
      const requete = vi.mocked(profilApi.updateMyProfile).mock.calls[0][0];
      expect(requete).not.toHaveProperty('role');
      expect(requete).not.toHaveProperty('status');
      expect(requete).not.toHaveProperty('email');

      // Le bandeau et l'en-tête suivent la réponse de l'API.
      expect(wrapper.get('.bandeau-profil').text()).toContain('Votre profil est complet');
      expect(useSessionStore().utilisateur?.displayName).toBe('Jeanne R.');
    });

    it('garde le code INSEE et la vérification si la ville ne change pas', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve());
      vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilApprouve());
      const wrapper = await monter();

      await wrapper.get('input[name="interestIds"][value="3"]').setValue(true);
      await envoyer(wrapper);

      expect(vi.mocked(profilApi.updateMyProfile).mock.calls[0][0]).toMatchObject({
        interestIds: [2, 3],
        location: { cityName: 'Toulouse', cityCode: '31555', verified: true },
      });
    });

    it('cas refusé par l’API : profil bloqué entre-temps (403) → lecture seule, focus sur le bandeau', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve());
      vi.mocked(profilApi.updateMyProfile).mockRejectedValue(
        new ApiError(403, 'PROFILE_BLOCKED', 'Ce profil est bloqué : il ne peut plus être modifié.'),
      );
      const wrapper = await monter();

      await wrapper.get('#profil-nom').setValue('Jeanne');
      await envoyer(wrapper);

      const bandeau = wrapper.get('.bandeau-profil');
      expect(bandeau.get('h3').text()).toBe('Profil bloqué');
      expect(document.activeElement).toBe(bandeau.element);
      expect(wrapper.find('form').exists()).toBe(false);
      expect(useSessionStore().utilisateur?.profileStatus).toBe('blocked');
    });

    it("cas refusé par l'API : erreur de validation rangée sous le champ, sans texte technique", async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve());
      vi.mocked(profilApi.updateMyProfile).mockRejectedValue(
        new ApiError(400, 'VALIDATION_FAILED', 'Certaines informations sont manquantes ou invalides.', [
          { field: 'location.postalCode', messages: ['postalCode must match /^[0-9]{5}$/ regular expression'] },
        ]),
      );
      const wrapper = await monter();

      await envoyer(wrapper);

      expect(wrapper.get('#profil-code-postal-erreur').text()).toContain('code postal invalide');
      expect(wrapper.get('#profil-code-postal').attributes('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(wrapper.get('.resume-erreurs').element);
      expect(wrapper.text()).not.toContain('must match');
    });

    it('code postal facultatif : un profil approuvé sans code postal enregistre ses autres modifications', async () => {
      // Comme les comptes de démonstration du seed : approuvés, ville et département, sans code postal.
      const demo = profilApprouve({
        location: { cityName: 'Lyon', departmentCode: '69', postalCode: null, cityCode: null, verified: false },
      });
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(demo);
      vi.mocked(profilApi.updateMyProfile).mockResolvedValue(demo);
      const wrapper = await monter();

      expect(wrapper.get('label[for="profil-code-postal"]').text()).toBe('Code postal (facultatif)');
      await wrapper.get('input[name="interestIds"][value="1"]').setValue(true);
      await envoyer(wrapper);

      expect(wrapper.find('.resume-erreurs').exists()).toBe(false);
      expect(vi.mocked(profilApi.updateMyProfile).mock.calls[0][0]).toMatchObject({
        interestIds: [2, 1],
        location: { cityName: 'Lyon', departmentCode: '69', postalCode: null, cityCode: null, verified: false },
      });
      expect(wrapper.get('.message--succes[role="status"]').text()).toBe('Vos modifications sont enregistrées.');
    });

    it('code postal facultatif : une nouvelle ville sans code postal est envoyée avec postalCode null', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
      vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
      const wrapper = await monter();

      await wrapper.get('#profil-ville').setValue('Albi');
      await wrapper.get('#profil-departement').setValue('81');
      await envoyer(wrapper);

      expect(vi.mocked(profilApi.updateMyProfile).mock.calls[0][0].location).toEqual({
        cityName: 'Albi',
        postalCode: null,
        departmentCode: '81',
        cityCode: null,
        verified: false,
      });
    });

    it("refuse de retirer la ville d'un profil approuvé, sans appeler l'API (R-PROF-5)", async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilApprouve());
      const wrapper = await monter();

      await wrapper.get('#profil-ville').setValue('');
      await wrapper.get('#profil-code-postal').setValue('');
      await wrapper.get('#profil-departement').setValue('');
      await envoyer(wrapper);

      expect(wrapper.get('#profil-ville-erreur').text()).toContain('peut être changée, mais pas retirée');
      expect(profilApi.updateMyProfile).not.toHaveBeenCalled();
    });

    it('signale un code postal, un département et un nom invalides dans le résumé', async () => {
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
      const wrapper = await monter();

      await wrapper.get('#profil-nom').setValue('J');
      await wrapper.get('#profil-ville').setValue('Toulouse');
      await wrapper.get('#profil-code-postal').setValue('310');
      await wrapper.get('#profil-departement').setValue('Haute-Garonne');
      await envoyer(wrapper);

      const resume = wrapper.get('[role="alert"]');
      expect(resume.findAll('li')).toHaveLength(3);
      expect(document.activeElement).toBe(resume.element);
      expect(wrapper.get('#profil-code-postal').attributes('aria-describedby')).toBe(
        'profil-code-postal-aide profil-code-postal-erreur',
      );
      expect(profilApi.updateMyProfile).not.toHaveBeenCalled();
    });

    it("au 10e centre d'intérêt, désactive les autres cases et l'explique tout de suite", async () => {
      const douze = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, slug: `i${i}`, label: `Intérêt ${i + 1}` }));
      vi.mocked(interestsApi.fetchInterests).mockResolvedValue(douze);
      vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
      const wrapper = await monter();
      const cases = () => wrapper.findAll<HTMLInputElement>('input[name="interestIds"]');
      const plafond = () => wrapper.get('#profil-interets-plafond');

      for (const caseACocher of cases().slice(0, 9)) await caseACocher.setValue(true);
      expect(plafond().text()).toBe('');
      expect(cases().every((c) => !c.element.disabled)).toBe(true);

      await cases()[9].setValue(true);
      expect(wrapper.text()).toContain('10 sur 10 choisis.');
      expect(plafond().text()).toContain('Vous avez choisi le maximum de 10');
      expect(plafond().attributes('aria-live')).toBe('polite');
      // Les cases cochées restent modifiables, les deux autres sont désactivées et expliquées.
      expect(cases().map((c) => c.element.disabled)).toEqual([...Array(10).fill(false), true, true]);
      expect(cases()[10].attributes('aria-describedby')).toBe('profil-interets-plafond');

      await cases()[0].setValue(false);
      expect(cases().every((c) => !c.element.disabled)).toBe(true);
      expect(plafond().text()).toBe('');

      // On peut alors échanger un centre d'intérêt contre un autre.
      await cases()[10].setValue(true);
      expect(wrapper.text()).toContain('10 sur 10 choisis.');
    });
  });

  it('sélectionne une commune vérifiée et conserve son code INSEE', async () => {
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockResolvedValue([
      { cityName: 'Lyon', postalCodes: ['69001'], departmentCode: '69', cityCode: '69123' },
    ]);
    vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    await wrapper.get('#profil-ville').setValue('Lyo');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    await wrapper.get('[aria-label="Communes proposées"] button').trigger('click');
    await envoyer(wrapper);
    expect(profilApi.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      location: { cityName: 'Lyon', departmentCode: '69', postalCode: '69001', cityCode: '69123', verified: true },
    }));
  });

  it('permet la saisie manuelle après une panne de recherche', async () => {
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockRejectedValue(new Error('offline'));
    vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    await wrapper.get('#profil-ville').setValue('Lyo');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.text()).toContain('saisissez la ville et le département');
    await wrapper.get('#profil-ville').setValue('Lyon');
    await wrapper.get('#profil-departement').setValue('69');
    await envoyer(wrapper);
    expect(profilApi.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      location: { cityName: 'Lyon', departmentCode: '69', postalCode: null, cityCode: null, verified: false },
    }));
  });

  it('laisse saisir la ville si la recherche ne trouve aucun résultat', async () => {
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockResolvedValue([]);
    vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    await wrapper.get('#profil-ville').setValue('Village fictif');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    expect(wrapper.text()).toContain('saisissez la ville et le département');
    await wrapper.get('#profil-departement').setValue('69');
    await envoyer(wrapper);
    expect(profilApi.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      location: { cityName: 'Village fictif', departmentCode: '69', postalCode: null, cityCode: null, verified: false },
    }));
  });

  it.each([
    { query: 'Seilhac', results: [
      { cityName: 'Seilhac', departmentCode: '19', postalCodes: ['19700'], cityCode: '19255' },
    ], expected: { cityName: 'Seilhac', departmentCode: '19', postalCode: '19700', cityCode: '19255', verified: true } },
    { query: 'Tulle', results: [
      { cityName: 'Tulle', departmentCode: '19', postalCodes: ['19000'], cityCode: '19272' },
      { cityName: 'Sainte-Tulle', departmentCode: '04', postalCodes: ['04220'], cityCode: '04197' },
    ], expected: { cityName: 'Tulle', departmentCode: '19', postalCode: '19000', cityCode: '19272', verified: true } },
  ])('affiche et enregistre $query en Corrèze depuis une réponse simulée', async ({ query, results, expected }) => {
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockResolvedValue(results);
    vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    vi.useFakeTimers();
    await demarrerRecherche(wrapper, query);
    await finirReponse();
    const buttons = wrapper.findAll('[aria-label="Communes proposées"] button');
    expect(buttons.map((button) => button.text())).toContain(`${query} (19) — ${expected.postalCode}`);
    if (query === 'Tulle') expect(buttons.map((button) => button.text())).toContain('Sainte-Tulle (04) — 04220');
    await buttons.find((button) => button.text().startsWith(`${query} (19)`))!.trigger('click');
    expect((wrapper.get('#profil-ville').element as HTMLInputElement).value).toBe(query);
    expect((wrapper.get('#profil-departement').element as HTMLInputElement).value).toBe('19');
    vi.useRealTimers();
    await envoyer(wrapper);
    expect(profilApi.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({ location: expected }));
  });

  it('termine le chargement immédiatement en saisie manuelle et ignore la réponse ancienne', async () => {
    const pending = attenteControlee<Awaited<ReturnType<typeof citiesApi.searchCities>>>();
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockReturnValue(pending.promise);
    vi.mocked(profilApi.updateMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    vi.useFakeTimers();
    await demarrerRecherche(wrapper, 'Sei');
    expect(wrapper.text()).toContain('Recherche de communes…');
    await wrapper.findAll('button').find((button) => button.text() === 'Saisir ma ville manuellement')!.trigger('click');
    expect(wrapper.text()).not.toContain('Recherche de communes…');
    await wrapper.get('#profil-ville').setValue('Seilhac');
    await wrapper.get('#profil-departement').setValue('19');
    pending.resoudre([{ cityName: 'Seilhac', departmentCode: '19', postalCodes: ['19700'], cityCode: '19255' }]);
    await finirReponse();
    expect(wrapper.find('[aria-label="Communes proposées"]').exists()).toBe(false);
    expect((wrapper.get('#profil-ville').element as HTMLInputElement).value).toBe('Seilhac');
    vi.useRealTimers();
    await envoyer(wrapper);
    expect(profilApi.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      location: { cityName: 'Seilhac', departmentCode: '19', postalCode: null, cityCode: null, verified: false },
    }));
  });

  it('efface le chargement si la saisie redescend sous deux caractères', async () => {
    const pending = attenteControlee<Awaited<ReturnType<typeof citiesApi.searchCities>>>();
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockReturnValue(pending.promise);
    const wrapper = await monter();
    vi.useFakeTimers();
    await demarrerRecherche(wrapper, 'Sei');
    expect(wrapper.text()).toContain('Recherche de communes…');
    await wrapper.get('#profil-ville').setValue('S');
    expect(wrapper.text()).not.toContain('Recherche de communes…');
    pending.resoudre([{ cityName: 'Seilhac', departmentCode: '19', postalCodes: ['19700'], cityCode: '19255' }]);
    await finirReponse();
    expect(wrapper.find('[aria-label="Communes proposées"]').exists()).toBe(false);
  });

  it('une réponse ancienne ne change pas le chargement ni les suggestions de la recherche suivante', async () => {
    const first = attenteControlee<Awaited<ReturnType<typeof citiesApi.searchCities>>>();
    const second = attenteControlee<Awaited<ReturnType<typeof citiesApi.searchCities>>>();
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    vi.mocked(citiesApi.searchCities).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const wrapper = await monter();
    vi.useFakeTimers();
    await demarrerRecherche(wrapper, 'Sei');
    await demarrerRecherche(wrapper, 'Tul');
    first.resoudre([{ cityName: 'Seilhac', departmentCode: '19', postalCodes: ['19700'], cityCode: '19255' }]);
    await finirReponse();
    expect(wrapper.text()).toContain('Recherche de communes…');
    expect(wrapper.find('[aria-label="Communes proposées"]').exists()).toBe(false);
    second.resoudre([{ cityName: 'Tulle', departmentCode: '19', postalCodes: ['19000'], cityCode: '19272' }]);
    await finirReponse();
    expect(wrapper.text()).not.toContain('Recherche de communes…');
    expect(wrapper.get('[aria-label="Communes proposées"]').text()).toContain('Tulle (19)');
  });

  it('nettoie la temporisation de recherche au démontage', async () => {
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    const wrapper = await monter();
    vi.useFakeTimers();
    await wrapper.get('#profil-ville').setValue('Sei');
    wrapper.unmount();
    vi.advanceTimersByTime(300);
    expect(citiesApi.searchCities).not.toHaveBeenCalled();
  });

  it('un visiteur non connecté est envoyé vers la connexion, puis reviendra ici', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
    vi.mocked(profilApi.fetchMyProfile).mockResolvedValue(profilVide());
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'accueil', component: { template: '<div />' } },
        { path: '/connexion', name: 'connexion', component: { template: '<div />' } },
        { path: '/mon-profil', name: 'mon-profil', component: ProfileView, meta: { connexionRequise: true } },
      ],
    });
    router.beforeEach(gardeDeSession);

    await router.push('/mon-profil');

    expect(router.currentRoute.value.name).toBe('connexion');
    expect(router.currentRoute.value.query.redirect).toBe('/mon-profil');
  });
});
