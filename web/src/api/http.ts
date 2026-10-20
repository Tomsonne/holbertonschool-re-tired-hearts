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