import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../api/auth';
import { ApiError } from '../api/http';
import { useSessionStore } from './session';

vi.mock('../api/auth', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));
const authApi = await import('../api/auth');

const membre: Me = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'odette@example.test',
  role: 'member',
  accountStatus: 'active',
  profileStatus: 'pending',
  displayName: 'Odette',
};

describe('magasin de session', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('charge le membre connecté depuis GET /me', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    const session = useSessionStore();

    await session.verifierSession();

    expect(session.estConnecte).toBe(true);
    expect(session.verifiee).toBe(true);
    expect(session.estApprouve).toBe(false); // profil encore « pending »
  });

  it('considère le visiteur déconnecté si /me répond 401', async () => {
    vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Merci de vous connecter.'));
    const session = useSessionStore();

    await session.verifierSession();

    expect(session.estConnecte).toBe(false);
    expect(session.verifiee).toBe(true);
  });

  it("n'appelle /me qu'une fois si deux vérifications arrivent en même temps", async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue(membre);
    const session = useSessionStore();

    await Promise.all([session.verifierSession(), session.verifierSession()]);
    await session.verifierSession();

    expect(authApi.fetchMe).toHaveBeenCalledTimes(1);
  });

  it('laisse remonter un refus de connexion sans connecter personne', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.'),
    );
    const session = useSessionStore();

    await expect(session.connexion({ email: 'x@example.test', password: 'mauvais-mot-de-passe' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(session.estConnecte).toBe(false);
  });

  it("oublie la session même si l'appel de déconnexion échoue", async () => {
    vi.mocked(authApi.login).mockResolvedValue(membre);
    vi.mocked(authApi.logout).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Indisponible'));
    const session = useSessionStore();
    await session.connexion({ email: membre.email, password: 'un-mot-de-passe-long' });

    await expect(session.deconnexion()).rejects.toBeInstanceOf(ApiError);
    expect(session.estConnecte).toBe(false);
  });
});