// Chemin de retour après connexion (paramètre ?redirect=).
// On n'accepte qu'un chemin interne à l'application : sinon, un lien piégé du type
// /connexion?redirect=https://site-malveillant.example enverrait le membre ailleurs
// juste après qu'il a saisi son mot de passe (redirection ouverte).
export function cheminDeRetour(valeur: unknown, parDefaut = '/'): string {
  if (typeof valeur !== 'string') return parDefaut;
  // Doit commencer par « / » mais pas par « // » ni « /\ » : le navigateur les lit comme un autre domaine.
  if (!valeur.startsWith('/') || valeur.startsWith('//') || valeur.startsWith('/\\')) return parDefaut;
  return valeur;
}
