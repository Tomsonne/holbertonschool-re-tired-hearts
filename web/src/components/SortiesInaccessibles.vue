<script setup lang="ts">
// Les sorties sont ouvertes à tout compte actif dont le profil n'est pas bloqué, même en attente
// de vérification (docs/regles-metier.md §5). On explique le refus au lieu d'afficher une erreur.
defineProps<{ raison: 'suspendu' | 'bloque' }>();
</script>

<template>
  <section class="message message--info" aria-labelledby="titre-sorties-inaccessibles">
    <h3 id="titre-sorties-inaccessibles">Sorties non disponibles</h3>
    <p v-if="raison === 'suspendu'">Votre compte est suspendu : vous ne pouvez plus consulter les sorties.</p>
    <p v-else>Votre profil est bloqué par la modération : vous ne pouvez plus consulter les sorties.</p>
    <p><RouterLink :to="{ name: 'mon-profil' }">Voir mon profil</RouterLink></p>
  </section>
</template>
