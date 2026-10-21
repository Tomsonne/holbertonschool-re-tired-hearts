<script setup lang="ts">
import { useSessionStore } from '../stores/session';

// Affiché à la place d'un écran réservé aux profils approuvés (R-PROF-3) : on explique
// pourquoi et on indique quoi faire, au lieu d'une erreur.
const session = useSessionStore();
</script>

<template>
  <section class="message message--info" aria-labelledby="titre-acces-reserve">
    <h3 id="titre-acces-reserve">Réservé aux profils approuvés</h3>
    <p v-if="session.utilisateur?.profileStatus === 'blocked'">
      Votre profil est bloqué par la modération : vous ne pouvez plus voir les autres membres.
    </p>
    <template v-else>
      <p>
        Vous pourrez découvrir les autres membres dès qu'un modérateur aura approuvé votre profil. Il faut
        pour cela une ville et au moins un centre d'intérêt.
      </p>
      <p><RouterLink :to="{ name: 'mon-profil' }">Compléter ou vérifier mon profil</RouterLink></p>
    </template>
  </section>
</template>
