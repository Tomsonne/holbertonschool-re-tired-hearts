import { defineStore } from 'pinia';
import * as authApi from '../api/auth';
import type { LoginInput, Me, RegisterInput } from '../api/auth';
import { ApiError } from '../api/http';

let chargementEnCours: Promise<void> | null = null;

export const useSessionStore = defineStore('session', {
  state: () => ({
    utilisateur: null as Me | null,
    verifiee: false,
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
    async verifierSession(): Promise<void> {
      if (this.verifiee) return;
      chargementEnCours ??= (async () => {
        try {
          this.utilisateur = await authApi.fetchMe();
        } catch (erreur) {
          this.utilisateur = null;
          if (!(erreur instanceof ApiError)) throw erreur;
        } finally {
          this.verifiee = true;
          chargementEnCours = null;
        }
      })();
      return chargementEnCours;
    },

    async connexion(identifiants: LoginInput): Promise<void> {
      this.utilisateur = await authApi.login(identifiants);
      this.verifiee = true;
    },

    async inscription(donnees: RegisterInput): Promise<void> {
      this.utilisateur = await authApi.register(donnees);
      this.verifiee = true;
    },

    async deconnexion(): Promise<void> {
      try {
        await authApi.logout();
      } finally {
        this.oublierSession();
      }
    },

    oublierSession(): void {
      this.utilisateur = null;
      this.verifiee = true;
    },
  },
});