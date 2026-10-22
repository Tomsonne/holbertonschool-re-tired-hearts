<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

// Confirmation d'une action de modération (mission 25) : la question nomme toujours la cible,
// et un motif peut être exigé. Le composant ne fait aucun appel : le parent agit sur « confirmer ».
const props = withDefaults(
  defineProps<{
    // Identifiant unique sur la page (plusieurs cartes peuvent ouvrir une confirmation).
    id: string;
    question: string;
    libelleConfirmer: string;
    libelleRenoncer?: string;
    // 'obligatoire' : motif exigé (bloquer, suspendre, annuler) ; 'aucun' : simple confirmation.
    motif?: 'obligatoire' | 'aucun';
    motifMin?: number;
    motifMax?: number;
    aideMotif?: string;
    enCours?: boolean;
    // Erreur venue de l'API sur le motif : affichée sous le champ.
    erreurMotifApi?: string | null;
  }>(),
  { libelleRenoncer: 'Non, ne rien changer', motif: 'aucun', motifMin: 5, motifMax: 500, aideMotif: '', enCours: false, erreurMotifApi: null },
);
const emit = defineEmits<{ confirmer: [motif: string | undefined]; renoncer: [] }>();

const texte = ref('');
const erreurLocale = ref<string | null>(null);
const champ = ref<HTMLTextAreaElement | null>(null);
const zone = ref<HTMLElement | null>(null);

const erreurMotif = computed(() => erreurLocale.value ?? props.erreurMotifApi);
const longueur = computed(() => texte.value.trim().length);
const ids = computed(() => ({
  question: `${props.id}-question`,
  champ: `${props.id}-motif`,
  aide: `${props.id}-motif-aide`,
  compteur: `${props.id}-motif-compteur`,
  erreur: `${props.id}-motif-erreur`,
}));

// À l'ouverture, le focus va au motif s'il y en a un, sinon sur la question.
onMounted(async () => {
  await nextTick();
  (props.motif === 'obligatoire' ? champ.value : zone.value)?.focus();
});

function confirmer(): void {
  if (props.enCours) return;
  if (props.motif === 'obligatoire') {
    if (longueur.value < props.motifMin || longueur.value > props.motifMax) {
      erreurLocale.value = `Indiquez un motif de ${props.motifMin} à ${props.motifMax} caractères.`;
      champ.value?.focus();
      return;
    }
    erreurLocale.value = null;
    emit('confirmer', texte.value.trim());
    return;
  }
  emit('confirmer', undefined);
}

// Le parent replace le focus sur le motif si l'API le refuse.
defineExpose({ focusMotif: () => champ.value?.focus() });
</script>

<template>
  <form
    ref="zone"
    class="confirmation confirmation-action"
    novalidate
    tabindex="-1"
    :aria-labelledby="ids.question"
    @submit.prevent="confirmer"
  >
    <p :id="ids.question" class="confirmation-action__question">{{ question }}</p>

    <div v-if="motif === 'obligatoire'" class="champ">
      <label :for="ids.champ">Motif</label>
      <p :id="ids.aide" class="champ__aide">
        Entre {{ motifMin }} et {{ motifMax }} caractères.{{ aideMotif ? ` ${aideMotif}` : '' }}
      </p>
      <textarea
        :id="ids.champ"
        ref="champ"
        v-model="texte"
        name="reason"
        rows="3"
        :maxlength="motifMax"
        :aria-invalid="erreurMotif ? 'true' : undefined"
        :aria-describedby="[ids.aide, ids.compteur, erreurMotif ? ids.erreur : ''].filter(Boolean).join(' ')"
      />
      <p :id="ids.compteur" class="compteur">{{ longueur }} / {{ motifMax }} caractères</p>
      <p v-if="erreurMotif" :id="ids.erreur" class="champ__erreur">{{ erreurMotif }}</p>
    </div>

    <div class="confirmation__actions">
      <button type="submit" class="bouton" :disabled="enCours">{{ enCours ? 'Patientez…' : libelleConfirmer }}</button>
      <button type="button" class="bouton bouton--secondaire" :disabled="enCours" @click="emit('renoncer')">
        {{ libelleRenoncer }}
      </button>
    </div>
  </form>
</template>
