<script setup lang="ts"></script>

<template>
  <a class="lien-evitement" href="#contenu-principal">Aller au contenu principal</a>

  <header class="en-tete-site">
    <div class="contenu">
      <h1 class="titre-site">Re-Tired Hearts</h1>
      <p>Se rencontrer et partager des activités après 60 ans</p>
    </div>
  </header>

  <main id="contenu-principal" class="contenu">
    <RouterView />
  </main>

  <footer class="pied-site">
    <div class="contenu">
      <p>Re-Tired Hearts — projet pédagogique Happy Retired. Aucune donnée réelle.</p>
    </div>
  </footer>
</template>
