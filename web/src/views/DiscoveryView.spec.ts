import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import type { Page, PublicProfile } from '../api/decouverte';
import { ApiError } from '../api/http';
import { gardeDeSession } from '../router/garde';
import { useSessionStore } from '../stores/session';
import DiscoveryView from './DiscoveryView.vue';
import MemberView from './MemberView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/interests', () => ({ fetchInterests: vi.fn() }));
vi.mock('../api/decouverte', () => ({ fetchProfiles: vi.fn(), fetchProfile: vi.fn() }));
const authApi = await import('../api/auth');
const interestsApi = await import('../api/interests');
const decouverteApi = await import('../api/decouverte');

const visiteur: Me = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'odette@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Odette',
};

function membre(n: number, surcharge: Partial<PublicProfile> = {}): PublicProfile {
  return {
    userId: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    displayName: `Membre ${n}`,
    bio: null,
    lookingFor: ['friendship'],
    interests: [{ id: 2, slug: 'jardinage', label: 'Jardinage' }],
    location: { cityName: 'Toulouse', departmentCode: '31' },
    isOrganizer: false,
    acceptsMessages: true,
    memberSince: '2026-09',
    ...surcharge,
  };
}

const page = (items: PublicProfile[], total = items.length, numero = 1): Page<PublicProfile> => ({
  items,
  page: numero,
  pageSize: 20,
  total,
});

let router: Router;
// Le rendu garde les retours à la ligne du template : on compare le texte comme le lit l'écran.
const lu = (w: { text(): string }) => w.text().replace(/\s+/g, ' ').trim();

async function monter(chemin = '/membres') {
  const vide = { render: () => h('div') };
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres', name: 'membres', component: DiscoveryView, meta: { connexionRequise: true } },
      { path: '/membres/:userId', name: 'membre', component: MemberView, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe('découverte des membres', () => {
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

  describe('les quatre états', () => {
    it('annonce la recherche en cours', async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockReturnValue(new Promise(() => {}));
      const wrapper = await monter();

      expect(wrapper.get('[role="status"]').text()).toBe('Recherche des membres…');
    });

    it("affiche l'erreur et recharge avec « Réessayer »", async () => {
      vi.mocked(decouverteApi.fetchProfiles)
        .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Le service est momentanément indisponible.'))
        .mockResolvedValueOnce(page([membre(1)]));
      const wrapper = await monter();

      const alerte = wrapper.get('[role="alert"]');
      expect(alerte.text()).toContain('Le service est momentanément indisponible.');
      await alerte.get('button').trigger('click');
      await flushPromises();

      expect(wrapper.findAll('.carte-membre')).toHaveLength(1);
    });

    it('aucun résultat avec des filtres : le dit et propose de les effacer', async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([]));
      const wrapper = await monter('/membres?interet=1&departement=2A');

      const message = wrapper.get('.resultats [role="status"]');
      expect(lu(message)).toContain('Aucun membre ne correspond à votre recherche pour « Balade » dans le département 2A.');
      await message.get('button').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/membres');
      expect(decouverteApi.fetchProfiles).toHaveBeenLastCalledWith({ interestId: undefined, departmentCode: undefined, page: 1 });
    });

    it('aucun membre du tout : message sans proposition de filtre', async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([]));
      const wrapper = await monter();

      expect(wrapper.get('.resultats [role="status"]').text()).toBe("Aucun autre membre n'est visible pour le moment. Revenez bientôt !");
      expect(wrapper.find('.resultats button').exists()).toBe(false);
    });

    it('succès : une carte par membre, avec seulement des données publiques', async () => {
      // Champs privés ajoutés exprès : même si l'API en renvoyait, l'écran ne doit pas les montrer.
      const avecFuite = {
        ...membre(1, { displayName: 'Jeanne', isOrganizer: true, memberSince: '2026-10' }),
        email: 'jeanne@example.test',
        location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31400', cityCode: '31555' },
      } as PublicProfile;
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([avecFuite, membre(2, { acceptsMessages: false })]));
      const wrapper = await monter();

      const cartes = wrapper.findAll('.carte-membre');
      expect(cartes).toHaveLength(2);
      expect(cartes[0].get('h4 a').attributes('href')).toBe(`/membres/${avecFuite.userId}`);
      expect(cartes[0].text()).toContain('Organisateur');
      expect(cartes[0].text()).toContain('Toulouse (31)');
      expect(lu(cartes[0])).toContain('Membre depuis octobre 2026 · Accepte les messages');
      expect(cartes[1].text()).not.toContain('Accepte les messages');
      expect(wrapper.text()).not.toMatch(/jeanne@example\.test|31400|31555/);
      expect(wrapper.text()).toContain('2 membres correspondent à votre recherche.');
    });
  });

  describe('filtres et pagination', () => {
    it("envoie les filtres à l'API et les garde dans l'adresse", async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(1)]));
      const wrapper = await monter();

      await wrapper.get('#filtre-interet').setValue('2');
      await wrapper.get('#filtre-departement').setValue(' 2a ');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/membres?interet=2&departement=2A');
      expect(decouverteApi.fetchProfiles).toHaveBeenLastCalledWith({ interestId: 2, departmentCode: '2A', page: 1 });
      // Le focus suit la mise à jour des résultats.
      expect(document.activeElement).toBe(wrapper.get('#titre-resultats').element);
    });

    it("refuse un département invalide sans appeler l'API", async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(1)]));
      const wrapper = await monter();

      await wrapper.get('#filtre-departement').setValue('Haute-Garonne');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('#filtre-departement-erreur').text()).toContain('par exemple 31, 2A ou 974');
      expect(wrapper.get('#filtre-departement').attributes('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(wrapper.get('#filtre-departement').element);
      expect(decouverteApi.fetchProfiles).toHaveBeenCalledTimes(1);
    });

    it("ignore les valeurs invalides tapées dans l'adresse", async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(1)]));
      await monter('/membres?interet=2147483648&departement=<script>&page=-3');

      expect(decouverteApi.fetchProfiles).toHaveBeenCalledWith({ interestId: undefined, departmentCode: undefined, page: 1 });
    });

    it('pagine par 20 en gardant les filtres', async () => {
      const vingt = Array.from({ length: 20 }, (_, i) => membre(i + 1));
      vi.mocked(decouverteApi.fetchProfiles)
        .mockResolvedValueOnce(page(vingt, 45, 1))
        .mockResolvedValueOnce(page(vingt, 45, 2));
      const wrapper = await monter('/membres?departement=31');

      const nav = wrapper.get('nav.pagination');
      expect(nav.attributes('aria-label')).toBe('Pages de résultats');
      expect(nav.text()).toContain('Page 1 sur 3');
      expect(nav.find('[rel="prev"]').exists()).toBe(false);
      await nav.get('[rel="next"]').trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/membres?departement=31&page=2');
      expect(decouverteApi.fetchProfiles).toHaveBeenLastCalledWith({ interestId: undefined, departmentCode: '31', page: 2 });
      expect(wrapper.get('nav.pagination').text()).toContain('Page 2 sur 3');
      expect(wrapper.find('[rel="prev"]').exists()).toBe(true);
    });

    it("ignore une réponse arrivée en retard : la recherche la plus récente l'emporte", async () => {
      let repondreAncienne!: (p: Page<PublicProfile>) => void;
      vi.mocked(decouverteApi.fetchProfiles)
        .mockResolvedValueOnce(page([membre(1)]))
        .mockReturnValueOnce(new Promise((ok) => (repondreAncienne = ok)))
        .mockResolvedValueOnce(page([membre(3, { displayName: 'Résultat récent' })]));
      const wrapper = await monter();

      // Deux recherches enchaînées : la première (lente) répond après la seconde.
      await router.push('/membres?departement=31');
      await router.push('/membres?departement=81');
      await flushPromises();
      expect(wrapper.text()).toContain('Résultat récent');

      repondreAncienne(page([membre(2, { displayName: 'Résultat périmé' })]));
      await flushPromises();
      expect(wrapper.text()).toContain('Résultat récent');
      expect(wrapper.text()).not.toContain('Résultat périmé');
    });

    it('page au-delà de la dernière : lien vers la première page', async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([], 3, 9));
      const wrapper = await monter('/membres?page=9');

      expect(wrapper.text()).toContain('la liste ne compte que 1 page');
      expect(wrapper.get('.resultats a').attributes('href')).toBe('/membres');
    });
  });

  describe('référentiel des centres d’intérêt', () => {
    it("n'attend pas le référentiel pour afficher les membres", async () => {
      vi.mocked(interestsApi.fetchInterests).mockReturnValue(new Promise(() => {}));
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(1)]));
      const wrapper = await monter();

      expect(wrapper.findAll('.carte-membre')).toHaveLength(1);
      expect(wrapper.get('#filtre-interet option').text()).toBe('Chargement des centres d’intérêt…');
    });

    it("signale l'échec du référentiel, désactive le filtre et permet de réessayer", async () => {
      vi.mocked(interestsApi.fetchInterests)
        .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Indisponible'))
        .mockResolvedValueOnce([{ id: 1, slug: 'balade', label: 'Balade' }]);
      vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(1)]));
      const wrapper = await monter();

      expect(wrapper.findAll('.carte-membre')).toHaveLength(1);
      const alerte = wrapper.get('#filtre-interet-erreur');
      expect(alerte.attributes('role')).toBe('alert');
      expect(alerte.text()).toContain("n'a pas pu être chargée");
      expect((wrapper.get('#filtre-interet').element as HTMLSelectElement).disabled).toBe(true);
      expect(wrapper.get('#filtre-interet').attributes('aria-describedby')).toBe('filtre-interet-aide filtre-interet-erreur');

      await alerte.get('button').trigger('click');
      await flushPromises();
      expect(wrapper.find('#filtre-interet-erreur').exists()).toBe(false);
      expect(wrapper.findAll('#filtre-interet option').map((o) => o.text())).toEqual(["Tous les centres d'intérêt", 'Balade']);
    });
  });

  describe('accès réservé aux profils approuvés', () => {
    it("profil en attente : explication et lien vers Mon profil, sans appel à l'API", async () => {
      vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur, profileStatus: 'pending' });
      const wrapper = await monter();

      expect(wrapper.get('#titre-acces-reserve').text()).toBe('Réservé aux profils approuvés');
      expect(wrapper.find('a[href="/mon-profil"]').exists()).toBe(true);
      expect(decouverteApi.fetchProfiles).not.toHaveBeenCalled();
    });

    it("refus de l'API (profil bloqué entre-temps) : même explication, session mise à jour", async () => {
      vi.mocked(decouverteApi.fetchProfiles).mockRejectedValue(
        new ApiError(403, 'PROFILE_BLOCKED', 'Ce profil ne peut pas accéder à cette fonctionnalité.'),
      );
      const wrapper = await monter();

      expect(wrapper.find('#titre-acces-reserve').exists()).toBe(true);
      expect(wrapper.text()).toContain('Votre profil est bloqué');
      expect(useSessionStore().utilisateur?.profileStatus).toBe('blocked');
    });
  });
});

describe("fiche d'un membre", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...visiteur });
    vi.mocked(interestsApi.fetchInterests).mockResolvedValue([]);
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('affiche le profil public, sans aucune donnée privée', async () => {
    const fiche = {
      ...membre(7, {
        displayName: 'Gaston',
        bio: 'Ancien instituteur.\n<b>Aime</b> la pétanque.',
        lookingFor: ['friendship', 'activities'],
        acceptsMessages: false,
      }),
      email: 'gaston@example.test',
      discoverable: true,
      allowMessages: false,
      location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31500', cityCode: '31555' },
    } as PublicProfile;
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(fiche);
    const wrapper = await monter(`/membres/${fiche.userId}`);

    expect(decouverteApi.fetchProfile).toHaveBeenCalledWith(fiche.userId);
    expect(wrapper.get('h2').text()).toBe('Gaston');
    expect(wrapper.text()).toContain('Toulouse (31)');
    expect(wrapper.text()).toContain('Amitié, Activités partagées');
    expect(wrapper.text()).toContain("N'accepte pas de nouveaux messages");
    // Présentation affichée en texte brut : la balise n'est pas interprétée.
    expect(wrapper.find('.fiche-membre__bio b').exists()).toBe(false);
    expect(wrapper.get('.fiche-membre__bio').text()).toContain('<b>Aime</b>');
    expect(wrapper.text()).not.toMatch(/gaston@example\.test|31500|31555/);
  });

  it('profil indisponible (404) : message neutre, sans détail', async () => {
    vi.mocked(decouverteApi.fetchProfile).mockRejectedValue(
      new ApiError(404, 'PROFILE_UNAVAILABLE', "Ce profil n'est pas disponible."),
    );
    const wrapper = await monter('/membres/inconnu');

    expect(wrapper.get('h2').text()).toBe('Profil indisponible');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("erreur réseau : message et « Réessayer »", async () => {
    vi.mocked(decouverteApi.fetchProfile)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Le service est momentanément indisponible.'))
      .mockResolvedValueOnce(membre(3));
    const wrapper = await monter(`/membres/${membre(3).userId}`);

    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Membre 3');
  });

  it('ouverte directement ou rechargée, la fiche garde le retour vers la même recherche', async () => {
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(membre(5));
    const wrapper = await monter(`/membres/${membre(5).userId}?departement=31&page=2`);

    expect(wrapper.get('.lien-retour a').attributes('href')).toBe('/membres?departement=31&page=2');
  });

  it("nettoie l'adresse de retour : impossible de renvoyer hors de la liste", async () => {
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(membre(5));
    const wrapper = await monter(`/membres/${membre(5).userId}?page=//evil.example&interet=1e99&redirect=https://x.example`);

    expect(wrapper.get('.lien-retour a').attributes('href')).toBe('/membres');
  });

  it("ignore une fiche arrivée en retard quand on est passé à une autre", async () => {
    let repondreAncienne!: (p: PublicProfile) => void;
    vi.mocked(decouverteApi.fetchProfile)
      .mockReturnValueOnce(new Promise((ok) => (repondreAncienne = ok)))
      .mockResolvedValueOnce(membre(9, { displayName: 'Fiche récente' }));
    const wrapper = await monter(`/membres/${membre(8).userId}`);

    await router.push(`/membres/${membre(9).userId}`);
    await flushPromises();
    repondreAncienne(membre(8, { displayName: 'Fiche périmée' }));
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Fiche récente');
  });

  it('le lien de retour ramène à la liste avec ses filtres et sa page', async () => {
    vi.mocked(decouverteApi.fetchProfiles).mockResolvedValue(page([membre(5)], 25, 2));
    vi.mocked(decouverteApi.fetchProfile).mockResolvedValue(membre(5));
    const wrapper = await monter('/membres?departement=31&page=2');

    await wrapper.get('.carte-membre h4 a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('membre');

    await wrapper.get('.lien-retour a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/membres?departement=31&page=2');
  });
});
