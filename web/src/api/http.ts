// Client HTTP partagé par tous les modules de l'interface.
// « credentials: same-origin » enverra le cookie de session mis en place en tâche 1.
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    // L'API renvoie toujours { statusCode, code, message } : on affiche son message,
    // jamais un détail technique (docs/contrats-api.md).
    const corps = await response.json().catch(() => null);
    throw new Error(corps?.message ?? 'Le service est momentanément indisponible.');
  }

  return response.json() as Promise<T>;
}
