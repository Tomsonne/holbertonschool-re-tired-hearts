import { nextTick, reactive, ref } from 'vue';
import { ApiError } from '../api/http';

// État partagé par les trois files de modération (profils, comptes, sorties) : quelle confirmation
// est ouverte, quelle action est en cours, et le retour affiché sur chaque carte.
// Les messages de refus de l'API sont affichés tels quels (CANNOT_MODERATE_MODERATOR, 409…).

export type Retour = { type: 'succes' | 'erreur'; texte: string };

export const idBouton = (cible: string, action: string) => `action-${cible}-${action}`;
export const idRetour = (cible: string) => `retour-${cible}`;

export function useActionsModeration() {
  const confirmation = ref<{ cible: string; action: string } | null>(null);
  const enCours = ref<string | null>(null);
  const retours = reactive<Record<string, Retour>>({});
  // Motif refusé par l'API (ex. trop court après nettoyage) : la confirmation reste ouverte.
  const erreurMotifApi = ref<string | null>(null);

  const estOuverte = (cible: string, action: string) =>
    confirmation.value?.cible === cible && confirmation.value.action === action;

  function ouvrir(cible: string, action: string): void {
    delete retours[cible];
    erreurMotifApi.value = null;
    confirmation.value = { cible, action };
  }

  async function renoncer(): Promise<void> {
    const ouverte = confirmation.value;
    confirmation.value = null;
    erreurMotifApi.value = null;
    await nextTick();
    if (ouverte) document.getElementById(idBouton(ouverte.cible, ouverte.action))?.focus();
  }

  // Exécute l'appel, puis place le focus sur le retour de la carte, lu aussitôt.
  // Renvoie le résultat de l'API, ou null en cas d'échec.
  async function executer<T>(cible: string, appel: () => Promise<T>, succes: string): Promise<T | null> {
    if (enCours.value) return null;
    enCours.value = cible;
    delete retours[cible];
    try {
      const resultat = await appel();
      confirmation.value = null;
      retours[cible] = { type: 'succes', texte: succes };
      return resultat;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED' && confirmation.value?.cible === cible) {
        erreurMotifApi.value = e.message;
        return null;
      }
      confirmation.value = null;
      retours[cible] = {
        type: 'erreur',
        texte: e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.',
      };
      return null;
    } finally {
      enCours.value = null;
      await nextTick();
      if (retours[cible]) document.getElementById(idRetour(cible))?.focus();
    }
  }

  return { confirmation, enCours, retours, erreurMotifApi, estOuverte, ouvrir, renoncer, executer };
}
