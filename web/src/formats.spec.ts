import { describe, expect, it } from 'vitest';
import { etatSortie, formaterHoraire, formaterPlaces, isoDepuisParis, partiesParis } from './formats';

// Les heures utilisent des espaces insécables ; on les rend visibles pour comparer.
const lisible = (texte: string) => texte.replace(/\u00a0/g, ' ');

describe('formats des sorties', () => {
  it("écrit la date et les heures à la française, à l'heure de Paris", () => {
    // 13 h 30 UTC en novembre = 14 h 30 à Paris (heure d'hiver).
    expect(lisible(formaterHoraire('2026-11-14T13:30:00.000Z', '2026-11-14T16:00:00.000Z'))).toBe(
      'Samedi 14 novembre 2026, de 14 h 30 à 17 h',
    );
    // 8 h UTC en juin = 10 h à Paris (heure d'été).
    expect(lisible(formaterHoraire('2027-06-05T08:00:00.000Z', '2027-06-05T10:15:00.000Z'))).toBe(
      'Samedi 5 juin 2027, de 10 h à 12 h 15',
    );
  });

  it('précise les deux jours quand la sortie dure plus d’une journée', () => {
    expect(lisible(formaterHoraire('2026-11-14T08:00:00.000Z', '2026-11-15T11:00:00.000Z'))).toBe(
      'Du samedi 14 novembre 2026 à 9 h au dimanche 15 novembre 2026 à 12 h',
    );
  });

  it('ne casse pas sur une date illisible', () => {
    expect(lisible(formaterHoraire('pas une date', '2026-11-14T16:00:00.000Z'))).toBe('');
  });

  it('accorde les places restantes', () => {
    expect(formaterPlaces({ availablePlaces: 3, capacity: 12 })).toBe('3 places restantes sur 12');
    expect(formaterPlaces({ availablePlaces: 1, capacity: 8 })).toBe('1 place restante sur 8');
    expect(formaterPlaces({ availablePlaces: 0, capacity: 12 })).toBe('Aucune place restante sur 12');
  });

  it("donne le statut affiché, l'annulation et la fin passant avant le « complet »", () => {
    const base = { status: 'published', isPast: false, availablePlaces: 2 };
    expect(etatSortie(base)).toBe('ouverte');
    expect(etatSortie({ ...base, availablePlaces: 0 })).toBe('complete');
    expect(etatSortie({ ...base, isPast: true, availablePlaces: 0 })).toBe('terminee');
    expect(etatSortie({ ...base, status: 'completed' })).toBe('terminee');
    expect(etatSortie({ ...base, status: 'cancelled', availablePlaces: 0 })).toBe('annulee');
    expect(etatSortie({ ...base, status: 'draft', isPast: true })).toBe('brouillon');
  });
});

describe('saisie des dates à l’heure de Paris', () => {
  it('convertit dans les deux sens, en hiver comme en été', () => {
    expect(isoDepuisParis('2026-11-14', '14:30')).toBe('2026-11-14T13:30:00.000Z');
    expect(isoDepuisParis('2027-06-05', '10:00')).toBe('2027-06-05T08:00:00.000Z');
    expect(partiesParis('2026-11-14T13:30:00.000Z')).toEqual({ date: '2026-11-14', heure: '14:30' });
    expect(partiesParis('2027-06-05T22:30:00.000Z')).toEqual({ date: '2027-06-06', heure: '00:30' });
  });

  it("gère les jours de changement d'heure", () => {
    // 29 mars 2026 : à 2 h, il est 3 h. 3 h 30 existe (heure d'été), 2 h 30 n'existe pas.
    expect(isoDepuisParis('2026-03-29', '03:30')).toBe('2026-03-29T01:30:00.000Z');
    expect(isoDepuisParis('2026-03-29', '02:30')).toBeNull();
    // 25 octobre 2026 : retour à l'heure d'hiver.
    expect(isoDepuisParis('2026-10-25', '12:00')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('refuse une date ou une heure qui n’existe pas', () => {
    expect(isoDepuisParis('2026-06-31', '10:00')).toBeNull();
    expect(isoDepuisParis('2026-06-01', '25:00')).toBeNull();
    expect(isoDepuisParis('', '10:00')).toBeNull();
    expect(partiesParis('pas une date')).toBeNull();
  });
});
