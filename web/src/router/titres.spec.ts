import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { router } from './index';

vi.mock('../api/auth', () => ({ fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() }));
const authApi = await import('../api/auth');

// Titres de page : c'est la première chose qu'annonce un lecteur d'écran à chaque
// changement de page. Toute nouvelle route doit en déclarer un.
describe('titres de page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
  });

  const routes = router.getRoutes().filter((r) => !r.redirect);

  it('chaque route a un titre explicite', () => {
    const sansTitre = routes.filter((r) => !r.meta.title?.trim()).map((r) => r.path);
    expect(sansTitre).toEqual([]);
  });

  it('deux pages différentes ne portent jamais le même titre', () => {
    const titres = routes.map((r) => r.meta.title);
    expect(new Set(titres).size).toBe(titres.length);
  });

  it("le titre de l'onglet suit la page, suivi du nom du site", async () => {
    await router.push('/connexion');
    expect(document.title).toBe('Connexion — Re-Tired Hearts');
    await router.push('/');
    expect(document.title).toBe('Accueil — Re-Tired Hearts');
  });
});
