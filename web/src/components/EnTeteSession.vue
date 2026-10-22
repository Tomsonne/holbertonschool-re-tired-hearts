<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';

// Zone de session de l'en-tête : liens pour un visiteur, nom et déconnexion pour un membre.
// La déconnexion doit rester facile à trouver sur toutes les pages (sujet, « Attentes produit »).
const session = useSessionStore();
const router = useRouter();
const deconnexionEnCours = ref(false);
const erreurDeconnexion = ref<string | null>(null);

async function seDeconnecter(): Promise<void> {
  if (deconnexionEnCours.value) return;
  deconnexionEnCours.value = true;
  erreurDeconnexion.value = null;
  try {
    await session.deconnexion();
  } catch {
    // La requête n'a pas abouti : le cookie est peut-être encore valide. On ne fait pas croire
    // à une déconnexion réussie ; le membre reste connecté et peut réessayer.
    erreurDeconnexion.value =
      'La déconnexion n’a pas abouti. Vérifiez votre connexion internet, puis réessayez.';
    return;
  } finally {
    deconnexionEnCours.value = false;
  }
  await router.push({ name: 'accueil' });
}
</script>

<template>
  <!-- Rien tant que GET /me n'a pas répondu, pour éviter d'afficher « Connexion » à un membre connecté. -->
  <nav v-if="session.verifiee" class="nav-session" aria-label="Mon compte">
    <template v-if="session.estConnecte">
      <p class="nav-session__nom">
        Connecté en tant que <strong>{{ session.utilisateur?.displayName }}</strong>
      </p>
      <RouterLink v-if="session.peutVoirSorties" class="bouton bouton--secondaire" :to="{ name: 'sorties' }">Les sorties</RouterLink>
      <RouterLink
        v-if="session.estOrganisateur && session.estApprouve"
        class="bouton bouton--secondaire"
        :to="{ name: 'mes-sorties' }"
      >Mes sorties</RouterLink>
      <RouterLink v-if="session.estApprouve" class="bouton bouton--secondaire" :to="{ name: 'membres' }">Les membres</RouterLink>
      <RouterLink v-if="session.peutVoirSorties" class="bouton bouton--secondaire" :to="{ name: 'messages' }">Messages</RouterLink>
      <RouterLink
        v-if="session.estModerateur && !session.estSuspendu"
        class="bouton bouton--secondaire"
        :to="{ name: 'moderation-profils' }"
      >Modération</RouterLink>
      <RouterLink class="bouton bouton--secondaire" :to="{ name: 'mon-profil' }">Mon profil</RouterLink>
      <button type="button" class="bouton bouton--secondaire" :disabled="deconnexionEnCours" @click="seDeconnecter">
        {{ deconnexionEnCours ? 'Déconnexion…' : erreurDeconnexion ? 'Réessayer la déconnexion' : 'Se déconnecter' }}
      </button>
      <p v-if="erreurDeconnexion" class="message message--erreur nav-session__erreur" role="alert">
        {{ erreurDeconnexion }}
      </p>
    </template>
    <template v-else>
      <RouterLink class="bouton bouton--secondaire" :to="{ name: 'connexion' }">Se connecter</RouterLink>
      <RouterLink class="bouton" :to="{ name: 'inscription' }">Créer un compte</RouterLink>
    </template>
  </nav>
</template>
