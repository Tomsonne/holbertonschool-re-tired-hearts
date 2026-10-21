import type { Recherche } from './api/profil';

// Libellés et formats partagés par les écrans qui affichent un profil.
export const LIBELLES_RECHERCHE: Record<Recherche, string> = {
  friendship: 'Amitié',
  companionship: 'Compagnie',
  romance: 'Relation amoureuse',
  activities: 'Activités partagées',
};

// « 2026-10 » → « octobre 2026 » (R-PROF : mois et année seulement).
export function formaterMembreDepuis(moisIso: string): string {
  if (!/^\d{4}-\d{2}$/.test(moisIso)) return '';
  return new Date(`${moisIso}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// R-LOC-2 : les membres ne voient que « Ville (département) ».
export const formaterLocalisation = (l: { cityName: string; departmentCode: string }) =>
  `${l.cityName} (${l.departmentCode})`;

export const DEPARTEMENT_VALIDE = /^(?:[0-9]{2}|2[AB]|97[1-6])$/;
