<script setup lang="ts">
import { computed } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import type { EventSummary } from '../api/sorties';
import { estFinie, etatSortie, formaterHoraire, formaterLocalisation, formaterPlaces, LIBELLES_ETAT_SORTIE } from '../formats';

// Carte d'une sortie, partagée par la liste publique (mission 16) et « Mes sorties » (mission 17).
const props = defineProps<{
  sortie: EventSummary;
  lien: RouteLocationRaw;
  // « Mes sorties » : l'organisateur, c'est soi-même (ligne retirée), et une sortie publiée
  // commencée est « En cours » jusqu'à sa fin, puis attend qu'il la clôture.
  pourOrganisateur?: boolean;
}>();

const etat = computed(() => etatSortie(props.sortie));
const commencee = computed(() => props.pourOrganisateur && props.sortie.status === 'published' && props.sortie.isPast);
const aCloturer = computed(() => commencee.value && estFinie(props.sortie));
const enCours = computed(() => commencee.value && !aCloturer.value);
const libelle = computed(() =>
  aCloturer.value ? 'À clôturer' : enCours.value ? 'En cours' : LIBELLES_ETAT_SORTIE[etat.value],
);
const classeBadge = computed(() =>
  aCloturer.value ? 'badge--a-cloturer' : enCours.value ? 'badge--ouverte' : `badge--${etat.value}`,
);
// Annulée ou terminée : des places « restantes » n'auraient plus de sens.
const afficherPlaces = computed(() => etat.value !== 'annulee' && etat.value !== 'terminee');
</script>

<template>
  <li class="carte carte-sortie">
    <h4 class="carte-sortie__titre">
      <RouterLink :to="lien">{{ sortie.title }}</RouterLink>
    </h4>
    <!-- Statut écrit en toutes lettres : la couleur du badge n'est qu'un appui. -->
    <p class="badge" :class="classeBadge">{{ libelle }}</p>
    <dl class="carte-sortie__infos">
      <dt>Date</dt>
      <dd>
        <time :datetime="sortie.startsAt">{{ formaterHoraire(sortie.startsAt, sortie.endsAt) }}</time>
      </dd>
      <dt>Lieu</dt>
      <dd>{{ formaterLocalisation(sortie.location) }}</dd>
      <template v-if="!pourOrganisateur">
        <dt>Organisée par</dt>
        <dd>{{ sortie.organizer.displayName }}</dd>
      </template>
      <template v-if="afficherPlaces">
        <dt>Places</dt>
        <dd>{{ formaterPlaces(sortie) }}</dd>
      </template>
    </dl>
    <p class="carte-sortie__pied">
      <span class="carte-sortie__theme">{{ sortie.interest.label }}</span>
      <strong v-if="sortie.myRegistration === 'registered'" class="carte-sortie__inscrit">Vous êtes inscrit</strong>
    </p>
  </li>
</template>
