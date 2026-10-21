import { describe, expect, it } from 'vitest';
import { etatSortie, formaterHoraire, formaterPlaces } from './formats';

describe('formats des sorties', () => {
  it("écrit la date et les heures à la française, à l'heure de Paris", () => {
    // 13 h 30 UTC en novembre = 14 h 30 à Paris (heure d'hiver).
    expect(formaterHoraire('2026-11-14T13:30:00.000Z', '2026-11-14T16:00:00.000Z')).toBe(
      'Samedi 14 novembre 2026, de 14 h 30 à 17 h',
    );
    // 8 h UTC en juin = 10 h à Paris (heure d'été).
    expect(formaterHoraire('2027-06-05T08:00:00.000Z', '2027-06-05T10:15:00.000Z')).toBe(
      'Samedi 5 juin 2027, de 10 h à 12 h 15',
    );
  });

  it('précise les deux jours quand la sortie dure plus d’une journée', () => {
    expect(formaterHoraire('2026-11-14T08:00:00.000Z', '2026-11-15T11:00:00.000Z')).toBe(
      'Du samedi 14 novembre 2026 à 9 h au dimanche 15 novembre 2026 à 12 h',
    );
  });

  it('ne casse pas sur une date illisible', () => {
    expect(formaterHoraire('pas une date', '2026-11-14T16:00:00.000Z')).toBe('');
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
