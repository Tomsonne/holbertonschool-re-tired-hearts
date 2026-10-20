<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchInterests, type Interest } from '../api/interests';

// Premier écran branché sur l'API : il affiche les centres d'intérêt venant de PostgreSQL
// et illustre les quatre états que toutes les vues devront gérer.
const interets = ref<Interest[]>([]);
const chargement = ref(true);
const erreur = ref<string | null>(null);

async function charger(): Promise<void> {
  chargement.value = true;
  erreur.value = null;
  try {
    interets.value = await fetchInterests();
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Une erreur est survenue.';
  } finally {
    chargement.value = false;
  }
}

onMounted(charger);
</script>

<template>
  <!-- Bandeau illustré : image décorative (alt vide). Le navigateur ne télécharge que la
       version adaptée à l'écran : très large sur ordinateur, plus haute sur tablette et mobile. -->
  <section class="bandeau-accueil" aria-labelledby="titre-accueil">
    <picture>
      <source
        media="(min-width: 1100px)"
        srcset="/images/banniere-1200.webp 1200w, /images/banniere-2000.webp 2000w"
        sizes="100vw"
        width="2000"
        height="330"
      />
      <source media="(min-width: 600px)" srcset="/images/banniere-tablette.webp" width="1100" height="434" />
      <img src="/images/banniere-carree.webp" width="800" height="440" alt="" />
    </picture>
    <div class="bandeau-accueil__texte">
      <p class="surtitre">Bienvenue</p>
      <h2 id="titre-accueil">Que la belle saison <em>commence</em>&nbsp;!</h2>
    </div>
  </section>

  <h2 class="titre-orne">Des activités près de chez vous</h2>
  <p>
    Re-Tired Hearts vous aide à rencontrer des personnes qui partagent vos centres d'intérêt, puis à
    vous retrouver lors d'activités locales. Voici les thèmes déjà proposés.
  </p>

  <section class="carte" aria-labelledby="titre-interets">
    <h3 id="titre-interets">Centres d'intérêt</h3>

    <!-- Chargement : annoncé aux lecteurs d'écran via aria-live. -->
    <p v-if="chargement" class="message" role="status">Chargement des centres d'intérêt…</p>

    <!-- Erreur : message lisible + action de reprise, jamais de détail technique. -->
    <div v-else-if="erreur" class="message message--erreur" role="alert">
      <p>{{ erreur }}</p>
      <button type="button" class="bouton" @click="charger">Réessayer</button>
    </div>

    <!-- Vide : cas normal sur une base fraîchement créée. -->
    <p v-else-if="interets.length === 0" class="message">
      Aucun centre d'intérêt n'est disponible pour le moment.
    </p>

    <!-- Succès. -->
    <ul v-else class="liste-interets">
      <li v-for="interet in interets" :key="interet.id">{{ interet.label }}</li>
    </ul>
  </section>
</template>
