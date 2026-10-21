import type { Page } from './decouverte';
import { apiDelete, apiGet, apiPost } from './http';
import type { Interest } from './interests';

// Contrats « EventSummary » et « EventDetail » (docs/contrats-api.md, tâche 2).
// Jamais de code postal ni de code INSEE : seulement « Ville (département) » (R-LOC-2).
export type StatutSortie = 'draft' | 'published' | 'cancelled' | 'completed';
export type StatutInscription = 'registered' | 'withdrawn';

export type Organisateur = { userId: string; displayName: string; isOrganizer: boolean };

export type EventSummary = {
  id: string;
  title: string;
  interest: Interest;
  startsAt: string;
  endsAt: string;
  location: { cityName: string; departmentCode: string };
  status: StatutSortie;
  isPast: boolean;
  capacity: number;
  availablePlaces: number;
  organizer: Organisateur;
  myRegistration: StatutInscription | null;
};

export type EventDetail = EventSummary & {
  description: string;
  areaHint: string | null;
  // null sauf pour l'organisateur, les inscrits et les modérateurs (R-LOC-4).
  exactAddress: string | null;
  cancellationReason: string | null;
  canRegister: boolean;
  registrationBlockedReason: string | null;
  isOrganizer: boolean;
};

export type ResultatInscription = { status: StatutInscription; availablePlaces: number };

export type FiltresSorties = { interestId?: number; departmentCode?: string; page?: number };

export function fetchEvents(filtres: FiltresSorties = {}): Promise<Page<EventSummary>> {
  const params = new URLSearchParams();
  if (filtres.interestId !== undefined) params.set('interestId', String(filtres.interestId));
  if (filtres.departmentCode) params.set('departmentCode', filtres.departmentCode);
  if (filtres.page && filtres.page > 1) params.set('page', String(filtres.page));
  const requete = params.toString();
  return apiGet<Page<EventSummary>>(`/events${requete ? `?${requete}` : ''}`);
}

export const fetchEvent = (id: string) => apiGet<EventDetail>(`/events/${encodeURIComponent(id)}`);

// Aucun identifiant d'inscription : l'API utilise toujours le membre de la session.
export const inscrire = (id: string) =>
  apiPost<ResultatInscription>(`/events/${encodeURIComponent(id)}/registration`);

export const desinscrire = (id: string) =>
  apiDelete<ResultatInscription>(`/events/${encodeURIComponent(id)}/registration`);

// ---------- Gestion par l'organisateur (mission 17) ----------
// Chaque action renvoie la fiche à jour ; l'API vérifie le propriétaire et l'état (R-EVT-7).
const chemin = (id: string) => `/events/${encodeURIComponent(id)}`;

export const publier = (id: string) => apiPost<EventDetail>(`${chemin(id)}/publish`);
export const annuler = (id: string, reason: string) => apiPost<EventDetail>(`${chemin(id)}/cancel`, { reason });
export const cloturer = (id: string) => apiPost<EventDetail>(`${chemin(id)}/complete`);
export const supprimer = (id: string) => apiDelete<void>(chemin(id));
