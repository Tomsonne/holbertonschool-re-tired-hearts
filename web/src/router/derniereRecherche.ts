// Adresse de la dernière liste de membres consultée (filtres et page compris), pour que la fiche
// d'un membre propose un retour au même endroit, quel que soit le type d'historique.
let adresse = '/membres';

export function memoriserRecherche(chemin: string): void {
  if (chemin.startsWith('/membres')) adresse = chemin;
}

export const derniereRecherche = (): string => adresse;
