import type { LocationQuery } from 'vue-router';
import { DEPARTEMENT_VALIDE } from '../formats';

// Filtres de la découverte des membres, tels qu'ils apparaissent dans l'adresse
// (?interet=&departement=&page=). Partagés par la liste et la fiche, qui les garde
// dans sa propre adresse pour proposer le retour à la même recherche.
export type FiltresMembres = { interestId?: number; departmentCode?: string; page: number };

// Bornes des paramètres côté serveur : identifiant = entier PostgreSQL (int4),
// page ≤ 10 000 (DiscoveryQueryDto). Au-delà, on ignore la valeur au lieu de provoquer une erreur.
export const ID_MAX = 2_147_483_647;
export const PAGE_MAX = 10_000;

const entierEntre = (valeur: number, min: number, max: number) =>
  Number.isSafeInteger(valeur) && valeur >= min && valeur <= max;

// Une adresse modifiée à la main ne doit jamais casser l'écran : on ignore ce qui est invalide.
export function lireFiltres(query: LocationQuery): FiltresMembres {
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  // Chiffres seulement : « 1e3 », « 0x10 » ou « 2.0 » ne sont pas des identifiants.
  const nombre = (v: unknown) => (/^\d{1,10}$/.test(texte(v)) ? Number(texte(v)) : NaN);
  const interet = nombre(query.interet);
  const departement = texte(query.departement).toUpperCase();
  const page = nombre(query.page);
  return {
    interestId: entierEntre(interet, 1, ID_MAX) ? interet : undefined,
    departmentCode: DEPARTEMENT_VALIDE.test(departement) ? departement : undefined,
    page: entierEntre(page, 2, PAGE_MAX) ? page : 1,
  };
}

export function versQuery(f: FiltresMembres): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.interestId !== undefined) q.interet = String(f.interestId);
  if (f.departmentCode) q.departement = f.departmentCode;
  if (f.page > 1) q.page = String(f.page);
  return q;
}
