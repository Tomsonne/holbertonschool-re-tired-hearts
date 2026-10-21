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

// ---------- Sorties (mission 16) ----------

// Toutes les sorties du MVP sont affichées à l'heure de Paris, quel que soit l'appareil :
// une date ne doit pas changer selon le réglage de l'ordinateur ou du téléphone.
const FUSEAU = 'Europe/Paris';
const formatJour = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSEAU,
});
const formatHeure = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: FUSEAU,
});

// « 14 h 30 », « 9 h » : l'écriture française des heures, plus lisible que « 14:30 ».
function heure(date: Date): string {
  const parties = formatHeure.formatToParts(date);
  const h = Number(parties.find((p) => p.type === 'hour')?.value);
  const m = parties.find((p) => p.type === 'minute')?.value ?? '00';
  return m === '00' ? `${h} h` : `${h} h ${m}`;
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

// « Samedi 25 octobre 2026, de 14 h 30 à 17 h », ou « Du samedi … à 10 h au dimanche … à 12 h ».
export function formaterHoraire(debutIso: string, finIso: string): string {
  const debut = new Date(debutIso);
  const fin = new Date(finIso);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return '';
  const jourDebut = formatJour.format(debut);
  const jourFin = formatJour.format(fin);
  if (jourDebut === jourFin) return majuscule(`${jourDebut}, de ${heure(debut)} à ${heure(fin)}`);
  return majuscule(`du ${jourDebut} à ${heure(debut)} au ${jourFin} à ${heure(fin)}`);
}

// Ce que le membre doit comprendre d'un coup d'œil. L'ordre compte : une sortie annulée
// reste « annulée » même si elle était complète ; une sortie passée est « terminée ».
export type EtatSortie = 'annulee' | 'terminee' | 'complete' | 'ouverte';

export function etatSortie(s: { status: string; isPast: boolean; availablePlaces: number }): EtatSortie {
  if (s.status === 'cancelled') return 'annulee';
  if (s.status === 'completed' || s.isPast) return 'terminee';
  if (s.availablePlaces <= 0) return 'complete';
  return 'ouverte';
}

export const LIBELLES_ETAT_SORTIE: Record<EtatSortie, string> = {
  annulee: 'Annulée',
  terminee: 'Terminée',
  complete: 'Complet',
  ouverte: 'Places disponibles',
};

// « 3 places restantes sur 12 », « 1 place restante sur 8 », « Aucune place restante sur 12 ».
export function formaterPlaces(s: { availablePlaces: number; capacity: number }): string {
  if (s.availablePlaces <= 0) return `Aucune place restante sur ${s.capacity}`;
  const pluriel = s.availablePlaces > 1 ? 's' : '';
  return `${s.availablePlaces} place${pluriel} restante${pluriel} sur ${s.capacity}`;
}
