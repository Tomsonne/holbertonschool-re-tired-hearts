import { describe, expect, it } from 'vitest';
import { ID_MAX, lireFiltres, PAGE_MAX, versQuery } from './filtresMembres';

describe('filtres de la découverte lus dans l’adresse', () => {
  it('garde les valeurs valides', () => {
    expect(lireFiltres({ interet: '12', departement: ' 2a ', page: '3' })).toEqual({
      interestId: 12,
      departmentCode: '2A',
      page: 3,
    });
  });

  it("ignore un identifiant hors de la plage d'un entier PostgreSQL", () => {
    expect(lireFiltres({ interet: String(ID_MAX) }).interestId).toBe(ID_MAX);
    expect(lireFiltres({ interet: '2147483648' }).interestId).toBeUndefined();
    expect(lireFiltres({ interet: '99999999999999999999' }).interestId).toBeUndefined();
  });

  it.each(['0', '-1', '1e3', '0x10', '2.0', ' ', 'abc'])("ignore l'identifiant « %s »", (valeur) => {
    expect(lireFiltres({ interet: valeur }).interestId).toBeUndefined();
  });

  it('ramène à la page 1 une page invalide ou au-delà de la limite du serveur', () => {
    expect(lireFiltres({ page: String(PAGE_MAX) }).page).toBe(PAGE_MAX);
    for (const page of [String(PAGE_MAX + 1), '0', '-2', '1.5', '//evil.example']) {
      expect(lireFiltres({ page }).page).toBe(1);
    }
  });

  it('ignore un paramètre répété ou un département inconnu', () => {
    expect(lireFiltres({ interet: ['1', '2'], departement: '99X' })).toEqual({ page: 1 });
  });

  it("reconstruit une adresse propre, sans les valeurs par défaut", () => {
    expect(versQuery({ page: 1 })).toEqual({});
    expect(versQuery({ interestId: 4, departmentCode: '31', page: 2 })).toEqual({ interet: '4', departement: '31', page: '2' });
  });
});
