export type FieldError = { field: string; messages: string[] };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGE_INDISPONIBLE = 'Le service est momentanément indisponible.';

// Fonction appelée quand l'API répond 401 SESSION_EXPIRED, quelle que soit la requête.
// Le routeur l'enregistre au démarrage : ce fichier n'a pas à connaître le routeur.
let surSessionExpiree: (() => void) | null = null;
export function quandSessionExpire(action: (() => void) | null): void {
  surSessionExpiree = action;
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', MESSAGE_INDISPONIBLE);
  }

  if (!response.ok) {
    const corps = await response.json().catch(() => null);
    if (response.status === 401 && corps?.code === 'SESSION_EXPIRED') surSessionExpiree?.();
    throw new ApiError(
      response.status,
      corps?.code ?? 'UNKNOWN_ERROR',
      corps?.message ?? MESSAGE_INDISPONIBLE,
      Array.isArray(corps?.details) ? corps.details : [],
    );
  }

  // 204 No Content (ex. POST /auth/logout) : pas de corps à lire.
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
export const apiPut = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const apiDelete = <T>(path: string) => request<T>('DELETE', path);
