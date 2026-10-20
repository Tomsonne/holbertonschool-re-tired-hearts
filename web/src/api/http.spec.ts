import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPost, quandSessionExpire } from './http';

function reponse(status: number, corps?: unknown): Response {
  return new Response(corps === undefined ? null : JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('client HTTP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    quandSessionExpire(null);
  });

  it('envoie le corps en JSON et le cookie de session', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchSimule);

    await apiPost('/auth/login', { email: 'a@example.test', password: 'x' });

    const [url, options] = fetchSimule.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('same-origin');
    expect(JSON.parse(options.body)).toEqual({ email: 'a@example.test', password: 'x' });
  });

  it("transforme une erreur de l'API en ApiError avec son code", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      reponse(409, { statusCode: 409, code: 'EMAIL_ALREADY_USED', message: 'Cette adresse e-mail est déjà utilisée.' }),
    ));

    await expect(apiPost('/auth/register', {})).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_USED',
      message: 'Cette adresse e-mail est déjà utilisée.',
    });
  });

  it('remplace une panne réseau par un message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const erreur = (await apiGet('/me').catch((e: unknown) => e)) as ApiError;

    expect(erreur).toBeInstanceOf(ApiError);
    expect(erreur.code).toBe('NETWORK_ERROR');
    expect(erreur.message).not.toContain('fetch');
  });

  it('prévient le routeur quand la session a expiré', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      reponse(401, { statusCode: 401, code: 'SESSION_EXPIRED', message: 'Votre session a expiré.' }),
    ));
    const action = vi.fn();
    quandSessionExpire(action);

    await expect(apiGet('/me/profile')).rejects.toBeInstanceOf(ApiError);
    expect(action).toHaveBeenCalledOnce();
  });

  it("ne prévient pas le routeur pour un simple refus d'identifiants", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      reponse(401, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Identifiants incorrects.' }),
    ));
    const action = vi.fn();
    quandSessionExpire(action);

    await expect(apiPost('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(action).not.toHaveBeenCalled();
  });
});
