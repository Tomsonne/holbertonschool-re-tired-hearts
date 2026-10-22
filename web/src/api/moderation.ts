import type { Page } from './decouverte';
import { apiGet, apiPost, apiPut } from './http';
import type { Interest } from './interests';

// Back-office de modération (docs/contrats-api.md, tâche 4). Toutes ces routes exigent le rôle
// modérateur : l'API répond 403 ROLE_REQUIRED à tout autre compte, quoi qu'affiche l'interface.

export type Role = 'member' | 'organizer' | 'moderator';
export type StatutProfil = 'pending' | 'approved' | 'blocked';
export type StatutCompte = 'active' | 'suspended';

export type ModerationProfile = {
  userId: string;
  email: string;
  role: Role;
  accountStatus: StatutCompte;
  status: StatutProfil;
  displayName: string;
  bio: string | null;
  lookingFor: string[];
  interests: Interest[];
  location: {
    cityName: string | null;
    departmentCode: string | null;
    postalCode: string | null;
    cityCode: string | null;
    verified: boolean;
  };
  discoverable: boolean;
  allowMessages: boolean;
  reviewedAt: string | null;
  createdAt: string;
};

export type ModerationUser = {
  id: string;
  email: string;
  role: Role;
  status: StatutCompte;
  profileStatus: StatutProfil | null;
  displayName: string | null;
  createdAt: string;
};

// Sortie vue par un modérateur : EventSummary, avec code postal et code INSEE en plus.
export type ModerationEvent = {
  id: string;
  title: string;
  interest: Interest | null;
  startsAt: string;
  endsAt: string;
  location: { cityName: string; departmentCode: string; postalCode: string | null; cityCode: string | null };
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  isPast: boolean;
  capacity: number;
  availablePlaces: number;
  organizer: { userId: string; displayName: string };
};

// Longueur des motifs exigée par l'API (moderation.dto.ts).
export const MOTIF = { min: 5, max: 500, maxAnnulation: 300 } as const;

const motif = (reason?: string) => (reason ? { reason } : {});
const pageEtFiltres = (filtres: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(filtres).forEach(([cle, valeur]) => {
    if (valeur !== undefined && valeur !== '' && !(cle === 'page' && valeur === 1)) params.set(cle, String(valeur));
  });
  const requete = params.toString();
  return requete ? `?${requete}` : '';
};
const id = (valeur: string) => encodeURIComponent(valeur);

// ---------- Profils ----------
export const fetchProfilsModeration = (filtres: { status?: StatutProfil; page?: number } = {}) =>
  apiGet<Page<ModerationProfile>>(`/moderation/profiles${pageEtFiltres(filtres)}`);
export const approuverProfil = (userId: string, reason?: string) =>
  apiPost<ModerationProfile>(`/moderation/profiles/${id(userId)}/approve`, motif(reason));
export const bloquerProfil = (userId: string, reason: string) =>
  apiPost<ModerationProfile>(`/moderation/profiles/${id(userId)}/block`, { reason });
export const debloquerProfil = (userId: string, reason?: string) =>
  apiPost<ModerationProfile>(`/moderation/profiles/${id(userId)}/unblock`, motif(reason));

// ---------- Comptes ----------
export const fetchComptesModeration = (filtres: { status?: StatutCompte; q?: string; page?: number } = {}) =>
  apiGet<Page<ModerationUser>>(`/moderation/users${pageEtFiltres(filtres)}`);
export const suspendreCompte = (userId: string, reason: string) =>
  apiPost<ModerationUser>(`/moderation/users/${id(userId)}/suspend`, { reason });
export const reactiverCompte = (userId: string, reason?: string) =>
  apiPost<ModerationUser>(`/moderation/users/${id(userId)}/reactivate`, motif(reason));
export const changerRole = (userId: string, role: 'member' | 'organizer', reason?: string) =>
  apiPut<ModerationUser>(`/moderation/users/${id(userId)}/role`, { role, ...motif(reason) });

// ---------- Sorties ----------
export const fetchSortiesModeration = (filtres: { status?: ModerationEvent['status']; page?: number } = {}) =>
  apiGet<Page<ModerationEvent>>(`/moderation/events${pageEtFiltres(filtres)}`);
export const annulerSortieModeration = (eventId: string, reason: string) =>
  apiPost<ModerationEvent>(`/moderation/events/${id(eventId)}/cancel`, { reason });
