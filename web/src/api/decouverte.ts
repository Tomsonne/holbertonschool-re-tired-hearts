import { apiGet } from './http';
import type { Interest } from './interests';
import type { Recherche } from './profil';

// Ce que voient les autres membres (contrat « PublicProfile ») : jamais d'e-mail,
// de code postal, de code INSEE ni de réglage de confidentialité.
export type PublicProfile = {
  userId: string;
  displayName: string;
  bio: string | null;
  lookingFor: Recherche[];
  interests: Interest[];
  location: { cityName: string; departmentCode: string };
  isOrganizer: boolean;
  acceptsMessages: boolean;
  memberSince: string;
};

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type FiltresDecouverte = { interestId?: number; departmentCode?: string; page?: number };

export function fetchProfiles(filtres: FiltresDecouverte = {}): Promise<Page<PublicProfile>> {
  const params = new URLSearchParams();
  if (filtres.interestId !== undefined) params.set('interestId', String(filtres.interestId));
  if (filtres.departmentCode) params.set('departmentCode', filtres.departmentCode);
  if (filtres.page && filtres.page > 1) params.set('page', String(filtres.page));
  const requete = params.toString();
  return apiGet<Page<PublicProfile>>(`/profiles${requete ? `?${requete}` : ''}`);
}

export const fetchProfile = (userId: string) => apiGet<PublicProfile>(`/profiles/${encodeURIComponent(userId)}`);
