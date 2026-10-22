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
  // Espaces insécables : « 14 h 30 » ne doit jamais être coupé en fin de ligne.
  return m === '00' ? `${h}\u00a0h` : `${h}\u00a0h\u00a0${m}`;
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
export type EtatSortie = 'brouillon' | 'annulee' | 'terminee' | 'complete' | 'ouverte';

// « brouillon » n'est visible que de son organisateur et des modérateurs.
export function etatSortie(s: { status: string; isPast: boolean; availablePlaces: number }): EtatSortie {
  if (s.status === 'draft') return 'brouillon';
  if (s.status === 'cancelled') return 'annulee';
  if (s.status === 'completed' || s.isPast) return 'terminee';
  if (s.availablePlaces <= 0) return 'complete';
  return 'ouverte';
}

// isPast devient vrai dès le DÉBUT de la sortie ; l'API n'autorise la clôture qu'après sa FIN.
export const estFinie = (s: { endsAt: string }, maintenant = Date.now()) => new Date(s.endsAt).getTime() <= maintenant;

export const LIBELLES_ETAT_SORTIE: Record<EtatSortie, string> = {
  brouillon: 'Brouillon',
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

// ---------- Messagerie (mission 21) ----------

// Même nettoyage que l'API (R-MSG-6) : espaces et retours à la ligne réduits à un espace, puis
// bords retirés. La longueur se compte en caractères visibles (un emoji = 1), comme l'API.
export const MESSAGE_MAX = 1000;
export const nettoyerMessage = (texte: string) => texte.replace(/\s+/gu, ' ').trim();
export const longueurMessage = (texte: string) => Array.from(nettoyerMessage(texte)).length;

// cannotSendReason est un code : on le traduit en une explication et une piste.
export const RAISONS_ENVOI_IMPOSSIBLE: Record<string, string> = {
  RECIPIENT_UNAVAILABLE: "Ce membre n'est plus disponible : vous pouvez relire la conversation, mais plus lui écrire.",
  MESSAGING_DISABLED:
    "Les messages privés sont désactivés, par vous ou par ce membre. Vous pouvez les réactiver dans « Mon profil ».",
  PROFILE_NOT_APPROVED: 'Votre profil doit être approuvé par un modérateur pour envoyer des messages.',
};

const formatJourCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSEAU });

// « Aujourd'hui à 14 h 30 », « Hier à 9 h », « 12 octobre 2026 à 18 h 05 » (heure de Paris).
// On compare des jours du calendrier à Paris, jamais des durées : aux changements d'heure, deux
// jours consécutifs sont séparés de 23 ou 25 heures, et « maintenant − 24 h » tomberait à côté.
export function formaterMoment(iso: string, maintenant = new Date()): string {
  const date = new Date(iso);
  const jourMessage = partiesParis(iso)?.date;
  const aujourdhui = partiesParis(maintenant.toISOString())?.date;
  if (!jourMessage || !aujourdhui) return '';
  // Veille calendaire de « aujourd'hui » : Date.UTC gère seul les fins de mois et d'année.
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const hier = new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
  const quand =
    jourMessage === aujourdhui ? "Aujourd'hui" : jourMessage === hier ? 'Hier' : formatJourCourt.format(date);
  return `${quand} à ${heure(date)}`;
}

// ---------- Saisie des dates d'une sortie (mission 17) ----------
// Le formulaire se remplit à l'heure de Paris, comme l'affichage : « 14:30 » veut dire 14 h 30
// à Paris, quel que soit le réglage de l'appareil. L'API reçoit et renvoie des dates ISO (UTC).
const formatParties = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function partiesDe(instant: number): Record<string, string> {
  return Object.fromEntries(formatParties.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
}

// ISO → { date: '2026-11-14', heure: '14:30' } à Paris, pour pré-remplir les champs.
export function partiesParis(iso: string): { date: string; heure: string } | null {
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return null;
  const p = partiesDe(instant);
  return { date: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}

// '2026-11-14' + '14:30' (heure de Paris) → ISO. null si la date ou l'heure n'existe pas
// (31 juin, ou heure sautée au passage à l'heure d'été).
export function isoDepuisParis(date: string, heure: string): string | null {
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const h = /^(\d{2}):(\d{2})$/.exec(heure);
  if (!j || !h) return null;
  const voulu = Date.UTC(+j[1], +j[2] - 1, +j[3], +h[1], +h[2]);
  // Paris a 1 ou 2 h d'avance sur UTC selon la saison : on corrige deux fois, pour les jours
  // de changement d'heure.
  let instant = voulu;
  for (let i = 0; i < 2; i += 1) {
    const p = partiesDe(instant);
    instant += voulu - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  const relu = partiesParis(new Date(instant).toISOString());
  return relu?.date === date && relu.heure === heure ? new Date(instant).toISOString() : null;
}

// ---------- Back-office (mission 25) ----------
// « 12 octobre 2026 », à l'heure de Paris (même format que les dates de la messagerie).
export function formaterDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : formatJourCourt.format(date);
}
