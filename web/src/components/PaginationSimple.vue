<script setup lang="ts">
import { computed } from 'vue';

// Pagination par boutons (back-office) : la page change sans quitter l'écran.
const props = defineProps<{ page: number; total: number; pageSize: number; etiquette: string }>();
const emit = defineEmits<{ aller: [page: number] }>();
const nombrePages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>

<template>
  <nav v-if="nombrePages > 1" class="pagination" :aria-label="etiquette">
    <button v-if="page > 1" type="button" class="bouton bouton--secondaire" @click="emit('aller', page - 1)">
      Page précédente
    </button>
    <p class="pagination__position">Page {{ page }} sur {{ nombrePages }}</p>
    <button v-if="page < nombrePages" type="button" class="bouton bouton--secondaire" @click="emit('aller', page + 1)">
      Page suivante
    </button>
  </nav>
</template>
