<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';

// Zone de session de l'en-tête : liens pour un visiteur, nom et déconnexion pour un membre.
// La déconnexion doit rester facile à trouver sur toutes les pages (sujet, « Attentes produit »).
const session = useSessionStore();
const router = useRouter();
const deconnexionEnCours = ref(false);

async function seDeconnecter(): Promise<void> {
  if (deconnexionEnCours.value) return;
  deconnexionEnCours.value = true;
  try {
    await session.deconnexion();
  } catch {
    // Même si l'API ne répond pas, le magasin a oublié la session : l'interface est déconnectée.
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
      <button type="button" class="bouton bouton--secondaire" :disabled="deconnexionEnCours" @click="seDeconnecter">
        {{ deconnexionEnCours ? 'Déconnexion…' : 'Se déconnecter' }}
      </button>
    </template>
    <template v-else>
      <RouterLink class="bouton bouton--secondaire" :to="{ name: 'connexion' }">Se connecter</RouterLink>
      <RouterLink class="bouton" :to="{ name: 'inscription' }">Créer un compte</RouterLink>
    </template>
  </nav>
</template>
