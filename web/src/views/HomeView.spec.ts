import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomeView from './HomeView.vue';

// On simule le module d'API : le test porte sur les états de l'écran, pas sur le réseau.
vi.mock('../api/interests', () => ({ fetchInterests: vi.fn() }));
const { fetchInterests } = await import('../api/interests');

describe('HomeView', () => {
  afterEach(() => vi.mocked(fetchInterests).mockReset());

  it('affiche les centres d\'intérêt renvoyés par l\'API', async () => {
    vi.mocked(fetchInterests).mockResolvedValue([{ id: 1, slug: 'marche', label: 'Marche et randonnée' }]);

    const wrapper = mount(HomeView);
    await flushPromises();

    expect(wrapper.findAll('.liste-interets li')).toHaveLength(1);
    expect(wrapper.text()).toContain('Marche et randonnée');
  });

  it('affiche un message lisible et un bouton Réessayer en cas d\'échec', async () => {
    vi.mocked(fetchInterests).mockRejectedValue(new Error('Le service est momentanément indisponible.'));

    const wrapper = mount(HomeView);
    await flushPromises();

    const alerte = wrapper.get('[role="alert"]');
    expect(alerte.text()).toContain('Le service est momentanément indisponible.');
    expect(wrapper.get('button').text()).toBe('Réessayer');
  });

  it('indique quand aucun centre d\'intérêt n\'est disponible', async () => {
    vi.mocked(fetchInterests).mockResolvedValue([]);

    const wrapper = mount(HomeView);
    await flushPromises();

    expect(wrapper.text()).toContain("Aucun centre d'intérêt n'est disponible");
  });
});
