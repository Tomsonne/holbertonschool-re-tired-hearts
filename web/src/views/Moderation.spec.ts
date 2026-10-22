import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import type { Me } from '../api/auth';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import type { ModerationEvent, ModerationProfile, ModerationUser } from '../api/moderation';
import { gardeDeSession } from '../router/garde';
import ModerationComptesView from './ModerationComptesView.vue';
import ModerationProfilsView from './ModerationProfilsView.vue';
import ModerationSortiesView from './ModerationSortiesView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/moderation', () => ({
  MOTIF: { min: 5, max: 500, maxAnnulation: 300 },
  fetchProfilsModeration: vi.fn(),
  approuverProfil: vi.fn(),
  bloquerProfil: vi.fn(),
  debloquerProfil: vi.fn(),
  fetchComptesModeration: vi.fn(),
  suspendreCompte: vi.fn(),
  reactiverCompte: vi.fn(),
  changerRole: vi.fn(),
  fetchSortiesModeration: vi.fn(),
  annulerSortieModeration: vi.fn(),
}));
const authApi = await import('../api/auth');
const api = await import('../api/moderation');

const moderatrice: Me = {
  id: '55555555-5555-5555-5555-555555555555',
  email: 'moderateur@example.test',
  role: 'moderator',
  accountStatus: 'active',
  profileStatus: 'approved',
  displayName: 'Modératrice',
};
const JEANNE = '33333333-3333-3333-3333-333333333333';
const SORTIE = '11111111-1111-1111-1111-111111111111';

const page = <T>(items: T[]): Page<T> => ({ items, page: 1, pageSize: 20, total: items.length });

function profil(surcharge: Partial<ModerationProfile> = {}): ModerationProfile {
  return {
    userId: JEANNE,
    email: 'jeanne@example.test',
    role: 'member',
    accountStatus: 'active',
    status: 'pending',
    displayName: 'Jeanne',
    bio: '<script>alert(1)</script> Passionnée de jardinage',
    lookingFor: ['friendship'],
    interests: [{ id: 2, slug: 'jardinage', label: 'Jardinage' }],
    location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31400', cityCode: null, verified: false },
    discoverable: true,
    allowMessages: true,
    reviewedAt: null,
    createdAt: '2026-10-12T16:05:00.000Z',
    ...surcharge,
  };
}

function compte(surcharge: Partial<ModerationUser> = {}): ModerationUser {
  return {
    id: JEANNE,
    email: 'jeanne@example.test',
    role: 'member',
    status: 'active',
    profileStatus: 'approved',
    displayName: 'Jeanne',
    createdAt: '2026-10-12T16:05:00.000Z',
    ...surcharge,
  };
}

function sortie(surcharge: Partial<ModerationEvent> = {}): ModerationEvent {
  return {
    id: SORTIE,
    title: 'Balade au Jardin des Plantes',
    interest: { id: 1, slug: 'balade', label: 'Balade' },
    startsAt: '2099-11-14T13:30:00.000Z',
    endsAt: '2099-11-14T16:00:00.000Z',
    location: { cityName: 'Toulouse', departmentCode: '31', postalCode: '31000', cityCode: '31555' },
    status: 'published',
    isPast: false,
    capacity: 12,
    availablePlaces: 9,
    organizer: { userId: '22222222-2222-2222-2222-222222222222', displayName: 'Marcel' },
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
      { path: '/sorties/:eventId', name: 'sortie', component: vide },
      { path: '/moderation', redirect: { name: 'moderation-profils' } },
      { path: '/moderation/profils', name: 'moderation-profils', component: ModerationProfilsView, meta: { connexionRequise: true, moderateurRequis: true } },
      { path: '/moderation/comptes', name: 'moderation-comptes', component: ModerationComptesView, meta: { connexionRequise: true, moderateurRequis: true } },
      { path: '/moderation/sorties', name: 'moderation-sorties', component: ModerationSortiesView, meta: { connexionRequise: true, moderateurRequis: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(chemin);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const lu = (w: { text(): string }) => w.text().replace(/\s+/g, ' ').trim();
const carte = (w: Monte) => w.get('.carte-moderation');
const boutons = (w: Monte) => carte(w).findAll('button').map((b) => b.text());
const cliquer = async (w: Monte, texte: string) => {
  const bouton = carte(w).findAll('button').find((b) => b.text().startsWith(texte));
  if (!bouton) throw new Error(`Bouton « ${texte} » introuvable`);
  await bouton.trigger('click');
  await flushPromises();
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...moderatrice });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('accès au back-office', () => {
  it("un membre est renvoyé à l'accueil, sans qu'aucune donnée de modération soit demandée", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ ...moderatrice, role: 'member' });
    await monter('/moderation');

    expect(router.currentRoute.value.name).toBe('accueil');
    expect(api.fetchProfilsModeration).not.toHaveBeenCalled();
  });

  it('un modérateur arrive sur la file des profils ; la file affichée est signalée', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([]));
    const wrapper = await monter('/moderation');

    expect(router.currentRoute.value.name).toBe('moderation-profils');
    expect(wrapper.get('.nav-moderation [aria-current="page"]').text()).toBe('Profils');
    expect(wrapper.get('[role="status"]').text()).toBe('Aucun profil en attente : tout est à jour.');
  });

  it("si l'API refuse quand même (rôle retiré entre-temps), son message est affiché", async () => {
    vi.mocked(api.fetchProfilsModeration).mockRejectedValue(
      new ApiError(403, 'ROLE_REQUIRED', "Vous n'avez pas le rôle requis pour effectuer cette action."),
    );
    const wrapper = await monter('/moderation/profils');

    expect(wrapper.get('[role="alert"]').text()).toContain("Vous n'avez pas le rôle requis");
  });
});

describe('file des profils', () => {
  it('montre tous les champs utiles à la décision, texte saisi jamais interprété', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    const wrapper = await monter('/moderation/profils');

    expect(api.fetchProfilsModeration).toHaveBeenCalledWith({ status: 'pending', page: 1 });
    expect(lu(wrapper.get('#titre-profils'))).toBe('Profils en attente (1)');
    const texte = lu(carte(wrapper));
    expect(texte).toContain('jeanne@example.test');
    expect(texte).toContain('Toulouse (31) — 31400, saisie manuelle');
    expect(texte).toContain('Jardinage');
    expect(carte(wrapper).find('script').exists()).toBe(false);
    expect(boutons(wrapper)).toEqual(['Approuver', 'Bloquer…']);
  });

  it('approuver : appel direct, carte mise à jour et retour focalisé', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    vi.mocked(api.approuverProfil).mockResolvedValue(profil({ status: 'approved' }));
    const wrapper = await monter('/moderation/profils');

    await cliquer(wrapper, 'Approuver');

    expect(api.approuverProfil).toHaveBeenCalledWith(JEANNE);
    const retour = carte(wrapper).get('[role="status"]');
    expect(retour.text()).toBe('Le profil de Jeanne est approuvé.');
    expect(document.activeElement).toBe(retour.element);
    expect(carte(wrapper).get('.badge').text()).toBe('Approuvé');
    expect(boutons(wrapper)).toEqual(['Bloquer…']);
  });

  it("profil incomplet : le refus de l'API est affiché tel quel", async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    vi.mocked(api.approuverProfil).mockRejectedValue(
      new ApiError(409, 'PROFILE_INCOMPLETE', 'Le profil doit avoir une ville et au moins un centre d’intérêt.'),
    );
    const wrapper = await monter('/moderation/profils');

    await cliquer(wrapper, 'Approuver');

    expect(carte(wrapper).get('[role="alert"]').text()).toBe('Le profil doit avoir une ville et au moins un centre d’intérêt.');
  });

  it('bloquer : confirmation nommant le membre, motif exigé, puis profil bloqué', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    vi.mocked(api.bloquerProfil).mockResolvedValue(profil({ status: 'blocked' }));
    const wrapper = await monter('/moderation/profils');

    await cliquer(wrapper, 'Bloquer');
    const confirmation = carte(wrapper).get('.confirmation-action');
    expect(confirmation.text()).toContain('Bloquer le profil de Jeanne (jeanne@example.test) ?');
    expect(document.activeElement?.tagName).toBe('TEXTAREA');

    await confirmation.get('textarea').setValue('Spam');
    await confirmation.trigger('submit');
    await flushPromises();
    expect(api.bloquerProfil).not.toHaveBeenCalled();
    expect(confirmation.get('.champ__erreur').text()).toBe('Indiquez un motif de 5 à 500 caractères.');

    await confirmation.get('textarea').setValue('  Publicité répétée  ');
    await confirmation.trigger('submit');
    await flushPromises();

    expect(api.bloquerProfil).toHaveBeenCalledWith(JEANNE, 'Publicité répétée');
    expect(carte(wrapper).get('[role="status"]').text()).toContain('Le profil de Jeanne est bloqué');
    expect(boutons(wrapper)).toEqual(['Débloquer']);
  });

  it('bloquer puis renoncer : rien envoyé, focus rendu au bouton', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    const wrapper = await monter('/moderation/profils');

    await cliquer(wrapper, 'Bloquer');
    await carte(wrapper).get('.confirmation-action .bouton--secondaire').trigger('click');
    await flushPromises();

    expect(api.bloquerProfil).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent?.trim()).toBe('Bloquer…');
  });

  it("motif refusé par l'API : la confirmation reste ouverte avec l'erreur sous le champ", async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil()]));
    vi.mocked(api.bloquerProfil).mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Certaines informations sont manquantes ou invalides.'),
    );
    const wrapper = await monter('/moderation/profils');

    await cliquer(wrapper, 'Bloquer');
    await carte(wrapper).get('textarea').setValue('Motif suffisant');
    await carte(wrapper).get('.confirmation-action').trigger('submit');
    await flushPromises();

    expect(carte(wrapper).get('.confirmation-action .champ__erreur').text()).toBe(
      'Certaines informations sont manquantes ou invalides.',
    );
  });

  it('profil d’un modérateur : aucune action proposée', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([profil({ role: 'moderator' })]));
    const wrapper = await monter('/moderation/profils');

    expect(boutons(wrapper)).toEqual([]);
    expect(carte(wrapper).text()).toContain('aucune action possible');
  });

  it('changer de liste recharge la file et place le focus sur son titre', async () => {
    vi.mocked(api.fetchProfilsModeration).mockResolvedValue(page([]));
    const wrapper = await monter('/moderation/profils');

    await wrapper.get('#filtre-statut-profil').setValue('blocked');
    await flushPromises();

    expect(api.fetchProfilsModeration).toHaveBeenLastCalledWith({ status: 'blocked', page: 1 });
    expect(document.activeElement?.id).toBe('titre-profils');
  });
});

describe('file des comptes', () => {
  it('recherche par nom ou e-mail', async () => {
    vi.mocked(api.fetchComptesModeration).mockResolvedValue(page([]));
    const wrapper = await monter('/moderation/comptes');

    await wrapper.get('#recherche-compte').setValue('  jeanne ');
    await wrapper.get('#filtre-statut-compte').setValue('suspended');
    await wrapper.get('form[role="search"]').trigger('submit');
    await flushPromises();

    expect(api.fetchComptesModeration).toHaveBeenLastCalledWith({ q: 'jeanne', status: 'suspended', page: 1 });
    expect(wrapper.get('[role="status"]').text()).toBe('Aucun compte ne correspond à « jeanne ».');
  });

  it('suspendre : confirmation nommant le compte, motif, puis carte mise à jour', async () => {
    vi.mocked(api.fetchComptesModeration).mockResolvedValue(page([compte()]));
    vi.mocked(api.suspendreCompte).mockResolvedValue(compte({ status: 'suspended' }));
    const wrapper = await monter('/moderation/comptes');

    await cliquer(wrapper, 'Suspendre');
    expect(carte(wrapper).get('.confirmation-action').text()).toContain(
      'Suspendre le compte de Jeanne (jeanne@example.test) ?',
    );
    await carte(wrapper).get('textarea').setValue('Comportement insultant');
    await carte(wrapper).get('.confirmation-action').trigger('submit');
    await flushPromises();

    expect(api.suspendreCompte).toHaveBeenCalledWith(JEANNE, 'Comportement insultant');
    expect(carte(wrapper).get('.badge').text()).toBe('Suspendu');
    expect(boutons(wrapper)).toEqual(['Réactiver', 'Nommer organisateur…']);
  });

  it('réactiver : prévient que les anciennes inscriptions ne reviennent pas', async () => {
    vi.mocked(api.fetchComptesModeration).mockResolvedValue(page([compte({ status: 'suspended' })]));
    vi.mocked(api.reactiverCompte).mockResolvedValue(compte());
    const wrapper = await monter('/moderation/comptes');

    await cliquer(wrapper, 'Réactiver');

    expect(api.reactiverCompte).toHaveBeenCalledWith(JEANNE);
    expect(carte(wrapper).get('[role="status"]').text()).toContain('Ses anciennes inscriptions ne sont pas rétablies');
  });

  it('nommer organisateur puis retirer le rôle, chaque fois après confirmation', async () => {
    vi.mocked(api.fetchComptesModeration).mockResolvedValue(page([compte()]));
    vi.mocked(api.changerRole)
      .mockResolvedValueOnce(compte({ role: 'organizer' }))
      .mockResolvedValueOnce(compte());
    const wrapper = await monter('/moderation/comptes');

    await cliquer(wrapper, 'Nommer organisateur');
    expect(carte(wrapper).get('.confirmation-action').text()).toContain('Nommer Jeanne organisateur ?');
    await carte(wrapper).get('.confirmation-action').trigger('submit');
    await flushPromises();
    expect(api.changerRole).toHaveBeenLastCalledWith(JEANNE, 'organizer');

    await cliquer(wrapper, 'Retirer le rôle');
    expect(carte(wrapper).get('.confirmation-action').text()).toContain('sans personne pour les gérer');
    await carte(wrapper).get('.confirmation-action').trigger('submit');
    await flushPromises();
    expect(api.changerRole).toHaveBeenLastCalledWith(JEANNE, 'member');
  });

  it("refus de l'API (modérateur visé) : son message est affiché", async () => {
    vi.mocked(api.fetchComptesModeration).mockResolvedValue(page([compte({ status: 'suspended' })]));
    vi.mocked(api.reactiverCompte).mockRejectedValue(
      new ApiError(403, 'CANNOT_MODERATE_MODERATOR', 'Un modérateur ne peut pas modérer un autre modérateur.'),
    );
    const wrapper = await monter('/moderation/comptes');

    await cliquer(wrapper, 'Réactiver');

    const alerte = carte(wrapper).get('[role="alert"]');
    expect(alerte.text()).toBe('Un modérateur ne peut pas modérer un autre modérateur.');
    expect(document.activeElement).toBe(alerte.element);
  });
});

describe('file des sorties', () => {
  it('annuler : confirmation nommant la sortie et le nombre d’inscrits, motif de 300 caractères au plus', async () => {
    vi.mocked(api.fetchSortiesModeration).mockResolvedValue(page([sortie()]));
    vi.mocked(api.annulerSortieModeration).mockResolvedValue(sortie({ status: 'cancelled' }));
    const wrapper = await monter('/moderation/sorties');

    expect(api.fetchSortiesModeration).toHaveBeenCalledWith({ status: 'published', page: 1 });
    expect(carte(wrapper).findAll('dd').map((d) => d.text())).toContain('3 sur 12');
    await cliquer(wrapper, 'Annuler la sortie');

    const confirmation = carte(wrapper).get('.confirmation-action');
    expect(lu(confirmation)).toContain(
      'Annuler la sortie « Balade au Jardin des Plantes » organisée par Marcel ? Les 3 personnes inscrites verront le motif.',
    );
    expect(confirmation.get('textarea').attributes('maxlength')).toBe('300');
    await confirmation.get('textarea').setValue('Arrêté préfectoral : parc fermé');
    await confirmation.trigger('submit');
    await flushPromises();

    expect(api.annulerSortieModeration).toHaveBeenCalledWith(SORTIE, 'Arrêté préfectoral : parc fermé');
    expect(carte(wrapper).get('.badge').text()).toBe('Annulée');
    expect(boutons(wrapper)).toEqual([]);
  });

  it("sortie annulée entre-temps : le refus de l'API est affiché", async () => {
    vi.mocked(api.fetchSortiesModeration).mockResolvedValue(page([sortie()]));
    vi.mocked(api.annulerSortieModeration).mockRejectedValue(
      new ApiError(409, 'INVALID_EVENT_TRANSITION', 'Cette sortie ne peut pas être annulée.'),
    );
    const wrapper = await monter('/moderation/sorties');

    await cliquer(wrapper, 'Annuler la sortie');
    await carte(wrapper).get('textarea').setValue('Doublon signalé');
    await carte(wrapper).get('.confirmation-action').trigger('submit');
    await flushPromises();

    expect(carte(wrapper).get('[role="alert"]').text()).toBe('Cette sortie ne peut pas être annulée.');
  });
});
