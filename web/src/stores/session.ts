import { defineStore } from 'pinia';
import * as authApi from '../api/auth';
import type { LoginInput, Me, RegisterInput } from '../api/auth';
import { ApiError } from '../api/http';

// Magasin de session : la seule source de vérité de l'interface sur « qui est connecté ».
// Le jeton reste dans le cookie httpOnly (R-AUTH-2) : on ne stocke ici que le `Me` renvoyé par l'API.
// Ces informations servent à adapter l'affichage ; l'API refait toujours ses propres contrôles.

// Appel GET /me en cours, partagé : si la garde et un composant demandent la session en même
// temps, un seul appel réseau part.
let chargementEnCours: Promise<void> | null = null;

export const useSessionStore = defineStore('session', {
  state: () => ({
    utilisateur: null as Me | null,
    // true dès que l'on sait si une session existe (GET /me a répondu, en succès ou en échec).
    verifiee: false,
    // true si GET /me a répondu 401 SESSION_EXPIRED au démarrage : la garde l'utilise une fois
    // pour afficher le message de R-AUTH-6.
    sessionExpiree: false,
  }),

  getters: {
    estConnecte: (state) => state.utilisateur !== null,
    estSuspendu: (state) => state.utilisateur?.accountStatus === 'suspended',
    estApprouve: (state) =>
      state.utilisateur?.accountStatus === 'active' && state.utilisateur.profileStatus === 'approved',
    estOrganisateur: (state) => state.utilisateur?.role === 'organizer',
    estModerateur: (state) => state.utilisateur?.role === 'moderator',
  },

  actions: {
    // Au démarrage : le cookie est illisible en JS, donc on demande à l'API qui on est.
    async verifierSession(): Promise<void> {
      if (this.verifiee) return;
      chargementEnCours ??= (async () => {
        try {
          this.utilisateur = await authApi.fetchMe();
        } catch (erreur) {
          this.utilisateur = null;
          if (!(erreur instanceof ApiError)) throw erreur;
          // Un cookie expiré n'est pas une absence de session : le membre doit être prévenu.
          if (erreur.code === 'SESSION_EXPIRED') this.sessionExpiree = true;
        } finally {
          this.verifiee = true;
          chargementEnCours = null;
        }
      })();
      return chargementEnCours;
    },

    // Renvoie true une seule fois après une expiration détectée, puis oublie l'information.
    consommerExpiration(): boolean {
      const expiree = this.sessionExpiree;
      this.sessionExpiree = false;
      return expiree;
    },

    async connexion(identifiants: LoginInput): Promise<void> {
      this.utilisateur = await authApi.login(identifiants);
      this.verifiee = true;
      this.sessionExpiree = false;
    },

    async inscription(donnees: RegisterInput): Promise<void> {
      this.utilisateur = await authApi.register(donnees);
      this.verifiee = true;
      this.sessionExpiree = false;
    },

    // On n'oublie la session que si l'API a bien effacé le cookie. Si la requête échoue
    // (réseau coupé, API en panne), le cookie est toujours valide : on garde la session et on
    // laisse remonter l'erreur pour que l'écran propose de réessayer.
    async deconnexion(): Promise<void> {
      try {
        await authApi.logout();
      } catch (erreur) {
        // 401 : la session était déjà terminée côté serveur, la déconnexion est donc acquise.
        const dejaDeconnecte = erreur instanceof ApiError && erreur.status === 401;
        if (!dejaDeconnecte) throw erreur;
      }
      this.oublierSession();
    },

    // Utilisé quand l'API répond 401 SESSION_EXPIRED en cours de navigation (R-AUTH-6).
    oublierSession(): void {
      this.utilisateur = null;
      this.verifiee = true;
    },
  },
});
