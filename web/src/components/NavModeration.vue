<script setup lang="ts">
// Navigation entre les files du back-office (mission 25). RouterLink ajoute aria-current="page"
// au lien de la page affichée : la file en cours est annoncée et soulignée autrement que par la couleur.
</script>

<template>
  <nav class="nav-moderation" aria-label="Files de modération">
    <RouterLink class="bouton bouton--secondaire" :to="{ name: 'moderation-profils' }">Profils</RouterLink>
    <RouterLink class="bouton bouton--secondaire" :to="{ name: 'moderation-comptes' }">Comptes</RouterLink>
    <RouterLink class="bouton bouton--secondaire" :to="{ name: 'moderation-sorties' }">Sorties</RouterLink>
  </nav>
</template>
