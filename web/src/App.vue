<script setup lang="ts">
import EnTeteSession from './components/EnTeteSession.vue';
import { useSessionStore } from './stores/session';

const session = useSessionStore();
</script>

<template>
  <a class="lien-evitement" href="#contenu-principal">Aller au contenu principal</a>

  <header class="en-tete-site">
    <div class="contenu en-tete-site__ligne">
      <div>
        <h1 class="titre-site"><RouterLink :to="{ name: 'accueil' }">Re-Tired Hearts</RouterLink></h1>
        <p>Se rencontrer et partager des activités après 60 ans</p>
      </div>
      <EnTeteSession />
    </div>
  </header>

  <!-- R-STATUS-1 : un compte suspendu garde sa session, mais doit comprendre pourquoi tout est refusé. -->
  <div v-if="session.estSuspendu" class="contenu">
    <p class="message message--erreur bandeau-statut" role="status">
      Votre compte est suspendu. Vous pouvez seulement consulter votre compte et vous déconnecter.
    </p>
  </div>

  <main id="contenu-principal" class="contenu">
    <RouterView />
  </main>

  <footer class="pied-site">
    <div class="contenu">
      <p>Re-Tired Hearts — projet pédagogique Happy Retired. Aucune donnée réelle.</p>
    </div>
  </footer>
</template>
