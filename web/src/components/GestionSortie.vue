<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ApiError } from '../api/http';
import { annuler, cloturer, publier, supprimer, type EventDetail } from '../api/sorties';

// Panneau « Gérer cette sortie » (mission 17), affiché sur la fiche à son seul organisateur.
// Il ne propose que les actions permises par l'état de la sortie (docs/regles-metier.md §5) ;
// l'API refait tous les contrôles, et son message d'erreur est affiché tel quel.

const props = defineProps<{ sortie: EventDetail }>();
const emit = defineEmits<{ misAJour: [sortie: EventDetail]; supprimee: [titre: string] }>();

type Action = 'publication' | 'annulation' | 'cloture' | 'suppression';
const MOTIF_MIN = 5;
const MOTIF_MAX = 300;

const actionEnCours = ref<Action | null>(null);
const confirmation = ref<'annulation' | 'suppression' | null>(null);
const motif = ref('');
const erreurMotif = ref<string | null>(null);
const retour = ref<{ type: 'succes' | 'erreur'; texte: string } | null>(null);

const zoneRetour = ref<HTMLElement | null>(null);
const zoneConfirmation = ref<HTMLElement | null>(null);
const champMotif = ref<HTMLTextAreaElement | null>(null);
const boutonAnnuler = ref<HTMLButtonElement | null>(null);
const boutonSupprimer = ref<HTMLButtonElement | null>(null);

const titre = computed(() => props.sortie.title);
const estBrouillon = computed(() => props.sortie.status === 'draft');
const estPubliee = computed(() => props.sortie.status === 'published');
// Indications seulement : l'heure de l'appareil peut être fausse, l'API tranche.
const debutPasse = computed(() => new Date(props.sortie.startsAt).getTime() <= Date.now());
const finPassee = computed(() => new Date(props.sortie.endsAt).getTime() <= Date.now());
const longueurMotif = computed(() => motif.value.trim().length);

async function annoncer(type: 'succes' | 'erreur', texte: string): Promise<void> {
  retour.value = { type, texte };
  // Le bouton utilisé disparaît souvent : le focus va sur le message, lu aussitôt.
  await nextTick();
  zoneRetour.value?.focus();
}

async function executer(action: Action, appel: () => Promise<EventDetail>, succes: string): Promise<void> {
  if (actionEnCours.value) return;
  actionEnCours.value = action;
  retour.value = null;
  try {
    const misAJour = await appel();
    confirmation.value = null;
    emit('misAJour', misAJour);
    await annoncer('succes', succes);
  } catch (e) {
    // Motif refusé par l'API : on garde la confirmation ouverte pour corriger.
    if (e instanceof ApiError && e.code === 'VALIDATION_FAILED' && confirmation.value === 'annulation') {
      erreurMotif.value = e.message;
      await nextTick();
      champMotif.value?.focus();
      return;
    }
    confirmation.value = null;
    await annoncer('erreur', e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.');
  } finally {
    actionEnCours.value = null;
  }
}

const publierSortie = () =>
  executer(
    'publication',
    () => publier(props.sortie.id),
    `« ${titre.value} » est publiée : les membres peuvent maintenant la voir et s'inscrire.`,
  );

const cloturerSortie = () =>
  executer('cloture', () => cloturer(props.sortie.id), `« ${titre.value} » est clôturée. Merci d'avoir organisé cette sortie !`);

async function ouvrirConfirmation(type: 'annulation' | 'suppression'): Promise<void> {
  retour.value = null;
  motif.value = '';
  erreurMotif.value = null;
  confirmation.value = type;
  await nextTick();
  (type === 'annulation' ? champMotif.value : zoneConfirmation.value)?.focus();
}

async function fermerConfirmation(): Promise<void> {
  const type = confirmation.value;
  confirmation.value = null;
  await nextTick();
  (type === 'annulation' ? boutonAnnuler.value : boutonSupprimer.value)?.focus();
}

async function confirmerAnnulation(): Promise<void> {
  const texte = motif.value.trim();
  if (texte.length < MOTIF_MIN || texte.length > MOTIF_MAX) {
    erreurMotif.value = `Indiquez un motif de ${MOTIF_MIN} à ${MOTIF_MAX} caractères : il sera montré aux personnes inscrites.`;
    champMotif.value?.focus();
    return;
  }
  erreurMotif.value = null;
  await executer(
    'annulation',
    () => annuler(props.sortie.id, texte),
    `« ${titre.value} » est annulée. Les personnes inscrites verront le motif sur la fiche.`,
  );
}

async function confirmerSuppression(): Promise<void> {
  if (actionEnCours.value) return;
  const titreSupprime = titre.value;
  actionEnCours.value = 'suppression';
  retour.value = null;
  try {
    await supprimer(props.sortie.id);
    emit('supprimee', titreSupprime);
  } catch (e) {
    confirmation.value = null;
    await annoncer('erreur', e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.');
  } finally {
    actionEnCours.value = null;
  }
}
</script>

<template>
  <section class="carte gestion-sortie" aria-labelledby="titre-gestion">
    <h3 id="titre-gestion">Gérer cette sortie</h3>

    <p
      v-if="retour"
      ref="zoneRetour"
      class="message"
      :class="retour.type === 'erreur' ? 'message--erreur' : 'message--succes'"
      :role="retour.type === 'erreur' ? 'alert' : 'status'"
      tabindex="-1"
    >
      {{ retour.texte }}
    </p>

    <!-- Annulation : motif obligatoire, montré aux inscrits. Le titre de la sortie est rappelé. -->
    <form
      v-if="confirmation === 'annulation'"
      class="confirmation"
      novalidate
      aria-labelledby="question-annulation"
      @submit.prevent="confirmerAnnulation"
    >
      <p id="question-annulation">
        Annuler « <strong>{{ titre }}</strong> » ? Cette décision est définitive : la sortie n'aura pas lieu
        et les personnes inscrites verront votre motif.
      </p>
      <div class="champ">
        <label for="motif-annulation">Motif de l'annulation</label>
        <p id="motif-annulation-aide" class="champ__aide">
          Entre {{ MOTIF_MIN }} et {{ MOTIF_MAX }} caractères, par exemple « Météo défavorable ».
        </p>
        <textarea
          id="motif-annulation"
          ref="champMotif"
          v-model="motif"
          name="reason"
          rows="3"
          :maxlength="MOTIF_MAX"
          :aria-invalid="erreurMotif ? 'true' : undefined"
          :aria-describedby="
            erreurMotif ? 'motif-annulation-aide motif-annulation-compteur motif-annulation-erreur' : 'motif-annulation-aide motif-annulation-compteur'
          "
        />
        <p id="motif-annulation-compteur" class="compteur">{{ longueurMotif }} / {{ MOTIF_MAX }} caractères</p>
        <p v-if="erreurMotif" id="motif-annulation-erreur" class="champ__erreur">{{ erreurMotif }}</p>
      </div>
      <div class="confirmation__actions">
        <button type="submit" class="bouton" :disabled="actionEnCours !== null">
          {{ actionEnCours === 'annulation' ? 'Annulation…' : `Oui, annuler « ${titre} »` }}
        </button>
        <button type="button" class="bouton bouton--secondaire" :disabled="actionEnCours !== null" @click="fermerConfirmation">
          Non, garder la sortie
        </button>
      </div>
    </form>

    <div
      v-else-if="confirmation === 'suppression'"
      ref="zoneConfirmation"
      class="confirmation"
      role="group"
      aria-labelledby="question-suppression"
      tabindex="-1"
    >
      <p id="question-suppression">
        Supprimer le brouillon « <strong>{{ titre }}</strong> » ? Il sera effacé définitivement.
      </p>
      <div class="confirmation__actions">
        <button type="button" class="bouton" :disabled="actionEnCours !== null" @click="confirmerSuppression">
          {{ actionEnCours === 'suppression' ? 'Suppression…' : 'Oui, supprimer le brouillon' }}
        </button>
        <button type="button" class="bouton bouton--secondaire" :disabled="actionEnCours !== null" @click="fermerConfirmation">
          Non, le garder
        </button>
      </div>
    </div>

    <template v-else-if="estBrouillon">
      <p v-if="debutPasse">
        La date de début est passée : ce brouillon ne peut plus être publié. Vous pouvez le supprimer.
      </p>
      <template v-else>
        <p>Une fois publiée, la sortie est visible de tous les membres, qui peuvent s'y inscrire.</p>
        <button type="button" class="bouton" :disabled="actionEnCours !== null" @click="publierSortie">
          {{ actionEnCours === 'publication' ? 'Publication…' : 'Publier la sortie' }}
        </button>
      </template>
      <button
        ref="boutonSupprimer"
        type="button"
        class="bouton bouton--secondaire"
        :disabled="actionEnCours !== null"
        @click="ouvrirConfirmation('suppression')"
      >
        Supprimer le brouillon
      </button>
    </template>

    <template v-else-if="estPubliee && finPassee">
      <p>La sortie est terminée. Clôturez-la pour l'indiquer à tous.</p>
      <button type="button" class="bouton" :disabled="actionEnCours !== null" @click="cloturerSortie">
        {{ actionEnCours === 'cloture' ? 'Clôture…' : 'Clôturer la sortie' }}
      </button>
    </template>

    <template v-else-if="estPubliee">
      <p>Un empêchement ? Vous pouvez annuler la sortie en expliquant pourquoi.</p>
      <button
        ref="boutonAnnuler"
        type="button"
        class="bouton bouton--secondaire"
        :disabled="actionEnCours !== null"
        @click="ouvrirConfirmation('annulation')"
      >
        Annuler la sortie
      </button>
    </template>

    <p v-else>Cette sortie est {{ sortie.status === 'cancelled' ? 'annulée' : 'clôturée' }} : elle ne peut plus être modifiée.</p>
  </section>
</template>
