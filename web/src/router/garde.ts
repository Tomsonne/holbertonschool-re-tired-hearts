import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { cheminDeRetour } from './redirection';

// Informations qu'une route peut déclarer dans `meta`.
declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    // Page réservée aux membres connectés (ex. « Mon profil »).
    connexionRequise?: boolean;
    // Page réservée aux visiteurs non connectés (connexion, inscription).
    invitesSeulement?: boolean;
  }
}

// Garde exécutée avant chaque navigation. Elle améliore le parcours (on n'affiche pas une page
// qui échouera), mais ne protège rien : l'API refait toujours ses propres contrôles.
export async function gardeDeSession(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const session = useSessionStore();

  // On attend de SAVOIR si une session existe : avant la réponse de GET /me,
  // « personne en mémoire » ne veut pas dire « déconnecté ».
  await session.verifierSession();

  // R-AUTH-6 au démarrage : GET /me a répondu SESSION_EXPIRED (cookie expiré, ou session
  // invalidée par une suspension). On l'explique sur la page de connexion, puis on ramènera
  // le membre ici. consommerExpiration() ne renvoie true qu'une fois : pas de boucle.
  if (session.consommerExpiration()) {
    if (to.name === 'connexion') {
      return to.query.raison === 'session-expiree'
        ? true
        : { name: 'connexion', query: { ...to.query, raison: 'session-expiree' } };
    }
    return { name: 'connexion', query: { redirect: to.fullPath, raison: 'session-expiree' } };
  }

  if (to.meta.connexionRequise && !session.estConnecte) {
    // On garde la page demandée pour y revenir après la connexion.
    return { name: 'connexion', query: { redirect: to.fullPath } };
  }

  if (to.meta.invitesSeulement && session.estConnecte) {
    // Déjà connecté : inutile de revoir le formulaire, on va là où il voulait aller.
    return cheminDeRetour(to.query.redirect);
  }

  return true;
}
