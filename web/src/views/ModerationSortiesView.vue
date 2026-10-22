<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import { annulerSortieModeration, fetchSortiesModeration, MOTIF, type ModerationEvent } from '../api/moderation';
import ConfirmationAction from '../components/ConfirmationAction.vue';
import NavModeration from '../components/NavModeration.vue';
import PaginationSimple from '../components/PaginationSimple.vue';
import { idBouton, idRetour, useActionsModeration } from '../composables/actionsModeration';
import { formaterHoraire, formaterLocalisation } from '../formats';

// File des sorties (mission 25) : GET /api/moderation/events, « publiées » par défaut.
// Un modérateur peut annuler une sortie publiée (motif obligatoire, montré aux inscrits).
// Il ne peut ni la modifier, ni la publier, ni la supprimer (R-EVT-7).

type Statut = ModerationEvent['status'];
const STATUTS: Record<Statut, string> = {
  published: 'Publiées',
  draft: 'Brouillons',
  cancelled: 'Annulées',
  completed: 'Terminées',
};
const BADGES: Record<Statut, string> = {
  published: 'Publiée',
  draft: 'Brouillon',
  cancelled: 'Annulée',
  completed: 'Terminée',
};

const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreur = ref('');
const resultats = ref<Page<ModerationEvent> | null>(null);
const statut = ref<Statut>('published');
const page = ref(1);
const titreListe = ref<HTMLElement | null>(null);

const actions = useActionsModeration();
const { estOuverte, ouvrir, renoncer, retours, enCours, erreurMotifApi } = actions;

const inscrits = (s: ModerationEvent) => s.capacity - s.availablePlaces;

function questionAnnulation(s: ModerationEvent): string {
  const n = inscrits(s);
  const qui = n === 0 ? 'Personne n’est inscrit.' : n === 1 ? 'La personne inscrite verra le motif.' : `Les ${n} personnes inscrites verront le motif.`;
  return `Annuler la sortie « ${s.title} » organisée par ${s.organizer.displayName || 'un membre indisponible'} ? ${qui} Cette décision est définitive.`;
}

async function charger(focus = false): Promise<void> {
  etat.value = 'chargement';
  erreur.value = '';
  try {
    resultats.value = await fetchSortiesModeration({ status: statut.value, page: page.value });
    etat.value = 'pret';
    if (focus) {
      await nextTick();
      titreListe.value?.focus();
    }
  } catch (e) {
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(() => charger());

function changerStatut(): void {
  page.value = 1;
  void charger(true);
}

function allerPage(n: number): void {
  page.value = n;
  void charger(true);
}

async function annuler(s: ModerationEvent, motif?: string): Promise<void> {
  const r = await actions.executer(
    s.id,
    () => annulerSortieModeration(s.id, motif ?? ''),
    `« ${s.title} » est annulée. Les personnes inscrites verront le motif sur la fiche.`,
  );
  if (r && resultats.value) {
    resultats.value.items = resultats.value.items.map((x) => (x.id === s.id ? { ...x, status: 'cancelled' } : x));
  }
}
</script>

<template>
  <h2 class="titre-orne">Modération</h2>
  <NavModeration />

  <section class="moderation" aria-labelledby="titre-sorties-moderation">
    <h3 id="titre-sorties-moderation" ref="titreListe" tabindex="-1">
      Sorties {{ STATUTS[statut].toLowerCase() }}{{ resultats && etat === 'pret' ? ` (${resultats.total})` : '' }}
    </h3>

    <div class="champ moderation__filtre">
      <label for="filtre-statut-sortie">Afficher les sorties</label>
      <select id="filtre-statut-sortie" v-model="statut" name="status" @change="changerStatut">
        <option v-for="(libelle, cle) in STATUTS" :key="cle" :value="cle">{{ libelle }}</option>
      </select>
    </div>

    <p v-if="etat === 'chargement'" class="message" role="status">Chargement des sorties…</p>

    <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
      <p>La liste des sorties n'a pas pu être chargée. {{ erreur }}</p>
      <button type="button" class="bouton" @click="charger()">Réessayer</button>
    </div>

    <p v-else-if="resultats && resultats.items.length === 0" class="message" role="status">
      Aucune sortie dans cette liste.
    </p>

    <template v-else-if="resultats">
      <ul class="liste-moderation">
        <li v-for="s in resultats.items" :key="s.id" class="carte carte-moderation">
          <h4 class="carte-moderation__titre">
            <RouterLink :to="{ name: 'sortie', params: { eventId: s.id } }">{{ s.title }}</RouterLink>
          </h4>
          <p class="badge" :class="s.status === 'cancelled' ? 'badge--annulee' : 'badge--ouverte'">{{ BADGES[s.status] }}</p>
          <dl class="fiche">
            <dt>Date</dt>
            <dd><time :datetime="s.startsAt">{{ formaterHoraire(s.startsAt, s.endsAt) }}</time></dd>
            <dt>Lieu</dt>
            <dd>{{ formaterLocalisation(s.location) }}{{ s.location.postalCode ? ` — ${s.location.postalCode}` : '' }}</dd>
            <dt>Organisée par</dt>
            <dd>{{ s.organizer.displayName || 'Membre indisponible' }}</dd>
            <dt>Inscrits</dt>
            <dd>{{ inscrits(s) }} sur {{ s.capacity }}</dd>
          </dl>

          <p
            v-if="retours[s.id]"
            :id="idRetour(s.id)"
            class="message"
            :class="retours[s.id].type === 'erreur' ? 'message--erreur' : 'message--succes'"
            :role="retours[s.id].type === 'erreur' ? 'alert' : 'status'"
            tabindex="-1"
          >
            {{ retours[s.id].texte }}
          </p>

          <ConfirmationAction
            v-if="estOuverte(s.id, 'annuler')"
            :id="`annuler-${s.id}`"
            :question="questionAnnulation(s)"
            :libelle-confirmer="`Oui, annuler « ${s.title} »`"
            libelle-renoncer="Non, garder la sortie"
            motif="obligatoire"
            :motif-max="MOTIF.maxAnnulation"
            aide-motif="Il sera montré aux personnes inscrites."
            :en-cours="enCours === s.id"
            :erreur-motif-api="erreurMotifApi"
            @confirmer="(m) => annuler(s, m)"
            @renoncer="renoncer"
          />

          <div v-else-if="s.status === 'published'" class="carte-moderation__actions">
            <button
              :id="idBouton(s.id, 'annuler')"
              type="button"
              class="bouton bouton--secondaire"
              :disabled="enCours !== null"
              @click="ouvrir(s.id, 'annuler')"
            >
              Annuler la sortie…
            </button>
          </div>
        </li>
      </ul>

      <PaginationSimple
        :page="resultats.page"
        :total="resultats.total"
        :page-size="resultats.pageSize"
        etiquette="Pages de sorties"
        @aller="allerPage"
      />
    </template>
  </section>
</template>
