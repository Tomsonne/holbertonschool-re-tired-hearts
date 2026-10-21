import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import type { EventDetail } from '../api/sorties';
import { gardeDeSession } from '../router/garde';
import EventView from '../views/EventView.vue';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
vi.mock('../api/sorties', () => ({
  fetchEvents: vi.fn(),
  fetchEvent: vi.fn(),
  inscrire: vi.fn(),
  desinscrire: vi.fn(),
  publier: vi.fn(),
  annuler: vi.fn(),
  cloturer: vi.fn(),
  supprimer: vi.fn(),
}));
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

const ID = '11111111-1111-1111-1111-111111111111';
const FUTUR = { startsAt: '2099-11-14T13:30:00.000Z', endsAt: '2099-11-14T16:00:00.000Z', isPast: false };
const PASSE = { startsAt: '2020-11-14T13:30:00.000Z', endsAt: '2020-11-14T16:00:00.000Z', isPast: true };

function sortie(surcharge: Partial<EventDetail> = {}): EventDetail {
  return {
    id: ID,
    title: 'Balade au Jardin des Plantes',
    interest: { id: 1, slug: 'balade', label: 'Balade' },
    ...FUTUR,
    location: { cityName: 'Toulouse', departmentCode: '31' },
    status: 'published',
    capacity: 12,
    availablePlaces: 4,
    organizer: { userId: organisateur.id, displayName: 'Marcel', isOrganizer: true },
    myRegistration: null,
    description: 'Une promenade tranquille, suivie d’un thé.',
    areaHint: null,
    exactAddress: '2 allée Jules-Guesde',
    cancellationReason: null,
    canRegister: false,
    registrationBlockedReason: 'Vous organisez cette sortie.',
    isOrganizer: true,
    ...surcharge,
  };
}

async function monter() {
  const vide = { render: () => h('div') };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'accueil', component: vide },
      { path: '/connexion', name: 'connexion', component: vide },
      { path: '/mon-profil', name: 'mon-profil', component: vide },
      { path: '/membres/:userId', name: 'membre', component: vide },
      { path: '/mes-sorties', name: 'mes-sorties', component: vide },
      { path: '/sorties', name: 'sorties', component: vide },
      { path: '/sorties/:eventId', name: 'sortie', component: EventView, meta: { connexionRequise: true } },
    ],
  });
  router.beforeEach(gardeDeSession);
  await router.push(`/sorties/${ID}`);
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const panneau = (w: Awaited<ReturnType<typeof monter>>) => w.get('.gestion-sortie');
const boutons = (w: Awaited<ReturnType<typeof monter>>) => panneau(w).findAll('button').map((b) => b.text());
const bandeau = (w: Awaited<ReturnType<typeof monter>>) => w.get('#titre-bandeau-sortie').text();

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(authApi.fetchMe).mockResolvedValue({ ...organisateur });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('panneau « Gérer cette sortie »', () => {
  it("n'apparaît pas pour un autre membre, qui garde la participation", async () => {
    vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(
      sortie({ isOrganizer: false, canRegister: true, registrationBlockedReason: null, exactAddress: null }),
    );
    const wrapper = await monter();

    expect(wrapper.find('.gestion-sortie').exists()).toBe(false);
    expect(wrapper.get('.inscription-sortie').text()).toContain('M’inscrire à cette sortie');
  });

  describe('brouillon', () => {
    it('publication : bandeau « Brouillon », puis message lu et actions de sortie publiée', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'draft' }));
      vi.mocked(sortiesApi.publier).mockResolvedValue(sortie());
      const wrapper = await monter();

      expect(bandeau(wrapper)).toBe('Brouillon');
      expect(wrapper.find('.inscription-sortie').exists()).toBe(false);
      expect(boutons(wrapper)).toEqual(['Publier la sortie', 'Supprimer le brouillon']);

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();

      expect(sortiesApi.publier).toHaveBeenCalledWith(ID);
      const message = panneau(wrapper).get('[role="status"]');
      expect(message.text()).toBe(
        '« Balade au Jardin des Plantes » est publiée : les membres peuvent maintenant la voir et s\'inscrire.',
      );
      expect(document.activeElement).toBe(message.element);
      expect(wrapper.find('#titre-bandeau-sortie').exists()).toBe(false);
      expect(boutons(wrapper)).toEqual(['Annuler la sortie']);
    });

    it("refus de l'API (date passée entre-temps) : son message est affiché tel quel", async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'draft' }));
      vi.mocked(sortiesApi.publier).mockRejectedValue(
        new ApiError(409, 'EVENT_IN_PAST', 'Une sortie passée ne peut pas être publiée.'),
      );
      const wrapper = await monter();

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();

      const alerte = panneau(wrapper).get('[role="alert"]');
      expect(alerte.text()).toBe('Une sortie passée ne peut pas être publiée.');
      expect(document.activeElement).toBe(alerte.element);
      expect(bandeau(wrapper)).toBe('Brouillon');
    });

    it('début déjà passé : pas de bouton « Publier », explication et suppression possible', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'draft', ...PASSE }));
      const wrapper = await monter();

      expect(panneau(wrapper).text()).toContain('ce brouillon ne peut plus être publié');
      expect(boutons(wrapper)).toEqual(['Supprimer le brouillon']);
    });

    it('suppression : confirmation nommant le brouillon, puis page « Brouillon supprimé »', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'draft' }));
      vi.mocked(sortiesApi.supprimer).mockResolvedValue(undefined);
      const wrapper = await monter();

      await panneau(wrapper).findAll('button')[1].trigger('click');
      await flushPromises();
      const confirmation = panneau(wrapper).get('.confirmation');
      expect(confirmation.text()).toContain('Supprimer le brouillon « Balade au Jardin des Plantes » ?');
      expect(document.activeElement).toBe(confirmation.element);
      expect(sortiesApi.supprimer).not.toHaveBeenCalled();

      await confirmation.get('button').trigger('click');
      await flushPromises();

      expect(sortiesApi.supprimer).toHaveBeenCalledWith(ID);
      const fin = wrapper.get('#titre-sortie-supprimee').element.closest('section')!;
      expect(fin.textContent).toContain('Le brouillon « Balade au Jardin des Plantes » a été supprimé.');
      expect(document.activeElement).toBe(fin);
      expect(fin.querySelector('a')?.getAttribute('href')).toBe('/mes-sorties');
      expect(wrapper.find('.fiche-sortie').exists()).toBe(false);
    });

    it('suppression : « Non, le garder » referme et rend le focus au bouton', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie({ status: 'draft' }));
      const wrapper = await monter();

      await panneau(wrapper).findAll('button')[1].trigger('click');
      await flushPromises();
      await panneau(wrapper).get('.confirmation .bouton--secondaire').trigger('click');
      await flushPromises();

      expect(wrapper.find('.confirmation').exists()).toBe(false);
      expect(document.activeElement?.textContent?.trim()).toBe('Supprimer le brouillon');
    });
  });

  describe('sortie publiée', () => {
    it('annulation : motif exigé, confirmation nommant la sortie, puis bandeau avec le motif', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
      vi.mocked(sortiesApi.annuler).mockResolvedValue(
        sortie({ status: 'cancelled', cancellationReason: 'Météo défavorable' }),
      );
      const wrapper = await monter();

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();
      const formulaire = panneau(wrapper).get('form.confirmation');
      expect(formulaire.text()).toContain('Annuler « Balade au Jardin des Plantes » ?');
      expect(document.activeElement?.id).toBe('motif-annulation');

      // Motif trop court : refusé sans appel à l'API, erreur liée au champ.
      await formulaire.get('textarea').setValue('  Non ');
      await formulaire.trigger('submit');
      await flushPromises();
      expect(sortiesApi.annuler).not.toHaveBeenCalled();
      expect(formulaire.get('#motif-annulation-erreur').text()).toContain('de 5 à 300 caractères');
      expect(formulaire.get('textarea').attributes('aria-describedby')).toContain('motif-annulation-erreur');
      expect(document.activeElement?.id).toBe('motif-annulation');

      await formulaire.get('textarea').setValue('  Météo défavorable  ');
      expect(formulaire.get('#motif-annulation-compteur').text()).toBe('17 / 300 caractères');
      await formulaire.trigger('submit');
      await flushPromises();

      expect(sortiesApi.annuler).toHaveBeenCalledWith(ID, 'Météo défavorable');
      expect(bandeau(wrapper)).toBe('Sortie annulée');
      expect(wrapper.text()).toContain("Motif donné par l'organisateur : Météo défavorable");
      expect(panneau(wrapper).get('[role="status"]').text()).toContain('est annulée');
      expect(panneau(wrapper).text()).toContain('elle ne peut plus être modifiée');
      expect(panneau(wrapper).findAll('button')).toHaveLength(0);
    });

    it('annulation : motif refusé par l’API, la confirmation reste ouverte pour corriger', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
      vi.mocked(sortiesApi.annuler).mockRejectedValue(
        new ApiError(400, 'VALIDATION_FAILED', 'Indiquez un motif de 5 à 300 caractères.'),
      );
      const wrapper = await monter();

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();
      await panneau(wrapper).get('textarea').setValue('Un motif');
      await panneau(wrapper).get('form').trigger('submit');
      await flushPromises();

      expect(panneau(wrapper).get('#motif-annulation-erreur').text()).toBe('Indiquez un motif de 5 à 300 caractères.');
      expect(document.activeElement?.id).toBe('motif-annulation');
    });

    it('annulation : « Non, garder la sortie » referme sans appel et rend le focus', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie());
      const wrapper = await monter();

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();
      await panneau(wrapper).get('.confirmation .bouton--secondaire').trigger('click');
      await flushPromises();

      expect(sortiesApi.annuler).not.toHaveBeenCalled();
      expect(document.activeElement?.textContent?.trim()).toBe('Annuler la sortie');
    });

    it('fin passée : seule la clôture est proposée, puis bandeau « Sortie terminée »', async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie(PASSE));
      vi.mocked(sortiesApi.cloturer).mockResolvedValue(sortie({ ...PASSE, status: 'completed' }));
      const wrapper = await monter();

      expect(boutons(wrapper)).toEqual(['Clôturer la sortie']);
      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();

      expect(sortiesApi.cloturer).toHaveBeenCalledWith(ID);
      expect(bandeau(wrapper)).toBe('Sortie terminée');
      expect(panneau(wrapper).get('[role="status"]').text()).toContain('est clôturée');
    });

    it("toute autre erreur de l'API (ex. rôle retiré) est affichée telle quelle", async () => {
      vi.mocked(sortiesApi.fetchEvent).mockResolvedValue(sortie(PASSE));
      vi.mocked(sortiesApi.cloturer).mockRejectedValue(
        new ApiError(403, 'ROLE_REQUIRED', 'Seul un organisateur peut créer ou gérer ses sorties.'),
      );
      const wrapper = await monter();

      await panneau(wrapper).get('button').trigger('click');
      await flushPromises();

      expect(panneau(wrapper).get('[role="alert"]').text()).toBe('Seul un organisateur peut créer ou gérer ses sorties.');
      expect(boutons(wrapper)).toEqual(['Clôturer la sortie']);
    });
  });
});
