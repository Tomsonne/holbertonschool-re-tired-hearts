<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import {
  approuverProfil,
  bloquerProfil,
  debloquerProfil,
  fetchProfilsModeration,
  MOTIF,
  type ModerationProfile,
  type StatutProfil,
} from '../api/moderation';
import ConfirmationAction from '../components/ConfirmationAction.vue';
import NavModeration from '../components/NavModeration.vue';
import PaginationSimple from '../components/PaginationSimple.vue';
import { idBouton, idRetour, useActionsModeration } from '../composables/actionsModeration';
import { formaterDate, LIBELLES_RECHERCHE } from '../formats';

// File des profils (mission 25) : GET /api/moderation/profiles, « en attente » par défaut.
// Le modérateur voit aussi les champs privés (e-mail, code postal) pour juger le profil.

const STATUTS: Record<StatutProfil, string> = { pending: 'En attente', approved: 'Approuvé', blocked: 'Bloqué' };
const ROLES: Record<string, string> = { member: 'Membre', organizer: 'Organisateur', moderator: 'Modérateur' };

const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreur = ref('');
const resultats = ref<Page<ModerationProfile> | null>(null);
const statut = ref<StatutProfil>('pending');
const page = ref(1);
const titreListe = ref<HTMLElement | null>(null);

const actions = useActionsModeration();
const { estOuverte, ouvrir, renoncer, retours, enCours, erreurMotifApi } = actions;

async function charger(focus = false): Promise<void> {
  etat.value = 'chargement';
  erreur.value = '';
  try {
    resultats.value = await fetchProfilsModeration({ status: statut.value, page: page.value });
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

function remplacer(p: ModerationProfile): void {
  if (!resultats.value) return;
  resultats.value.items = resultats.value.items.map((x) => (x.userId === p.userId ? p : x));
}

async function approuver(p: ModerationProfile): Promise<void> {
  const r = await actions.executer(p.userId, () => approuverProfil(p.userId), `Le profil de ${p.displayName} est approuvé.`);
  if (r) remplacer(r);
}

async function bloquer(p: ModerationProfile, motif?: string): Promise<void> {
  const r = await actions.executer(
    p.userId,
    () => bloquerProfil(p.userId, motif ?? ''),
    `Le profil de ${p.displayName} est bloqué : il n'apparaît plus aux autres membres.`,
  );
  if (r) remplacer(r);
}

async function debloquer(p: ModerationProfile): Promise<void> {
  const r = await actions.executer(p.userId, () => debloquerProfil(p.userId), `Le profil de ${p.displayName} est débloqué.`);
  if (r) remplacer(r);
}

const recherche = (p: ModerationProfile) =>
  p.lookingFor.map((r) => (LIBELLES_RECHERCHE as Record<string, string>)[r] ?? r).join(', ');

const localisation = (p: ModerationProfile) =>
  p.location.cityName
    ? `${p.location.cityName} (${p.location.departmentCode ?? '?'})${p.location.postalCode ? ` — ${p.location.postalCode}` : ''}` +
      (p.location.verified ? ', commune vérifiée' : ', saisie manuelle')
    : 'Non renseignée';
</script>

<template>
  <h2 class="titre-orne">Modération</h2>
  <NavModeration />

  <section class="moderation" aria-labelledby="titre-profils">
    <h3 id="titre-profils" ref="titreListe" tabindex="-1">
      Profils {{ STATUTS[statut].toLowerCase() }}{{ resultats && etat === 'pret' ? ` (${resultats.total})` : '' }}
    </h3>

    <div class="champ moderation__filtre">
      <label for="filtre-statut-profil">Afficher les profils</label>
      <select id="filtre-statut-profil" v-model="statut" name="status" @change="changerStatut">
        <option v-for="(libelle, cle) in STATUTS" :key="cle" :value="cle">{{ libelle }}</option>
      </select>
    </div>

    <p v-if="etat === 'chargement'" class="message" role="status">Chargement des profils…</p>

    <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
      <p>La liste des profils n'a pas pu être chargée. {{ erreur }}</p>
      <button type="button" class="bouton" @click="charger()">Réessayer</button>
    </div>

    <p v-else-if="resultats && resultats.items.length === 0" class="message" role="status">
      {{ statut === 'pending' ? 'Aucun profil en attente : tout est à jour.' : 'Aucun profil dans cette liste.' }}
    </p>

    <template v-else-if="resultats">
      <ul class="liste-moderation">
        <li v-for="p in resultats.items" :key="p.userId" class="carte carte-moderation">
          <h4 class="carte-moderation__titre">{{ p.displayName }}</h4>
          <p class="badge" :class="`badge--profil-${p.status}`">{{ STATUTS[p.status] }}</p>

          <!-- Texte saisi par le membre : interpolation uniquement, jamais v-html. -->
          <p v-if="p.bio" class="carte-moderation__bio">{{ p.bio }}</p>
          <dl class="fiche">
            <dt>E-mail</dt>
            <dd>{{ p.email }}</dd>
            <dt>Compte</dt>
            <dd>{{ ROLES[p.role] }}{{ p.accountStatus === 'suspended' ? ', suspendu' : '' }}</dd>
            <dt>Ville</dt>
            <dd>{{ localisation(p) }}</dd>
            <dt>Centres d'intérêt</dt>
            <dd>{{ p.interests.map((i) => i.label).join(', ') || 'Aucun' }}</dd>
            <dt>Recherche</dt>
            <dd>
              {{ recherche(p) || 'Non précisé' }}
            </dd>
            <dt>Inscrit</dt>
            <dd>{{ formaterDate(p.createdAt) }}</dd>
          </dl>

          <p
            v-if="retours[p.userId]"
            :id="idRetour(p.userId)"
            class="message"
            :class="retours[p.userId].type === 'erreur' ? 'message--erreur' : 'message--succes'"
            :role="retours[p.userId].type === 'erreur' ? 'alert' : 'status'"
            tabindex="-1"
          >
            {{ retours[p.userId].texte }}
          </p>

          <p v-if="p.role === 'moderator'" class="champ__aide">Profil d'un modérateur : aucune action possible.</p>

          <ConfirmationAction
            v-else-if="estOuverte(p.userId, 'bloquer')"
            :id="`bloquer-${p.userId}`"
            :question="`Bloquer le profil de ${p.displayName} (${p.email}) ? Il disparaîtra de la découverte, ne pourra plus écrire ni s'inscrire, et sera désinscrit des sorties à venir.`"
            :libelle-confirmer="`Oui, bloquer ${p.displayName}`"
            motif="obligatoire"
            :motif-max="MOTIF.max"
            aide-motif="Il est enregistré dans le journal de modération."
            :en-cours="enCours === p.userId"
            :erreur-motif-api="erreurMotifApi"
            @confirmer="(m) => bloquer(p, m)"
            @renoncer="renoncer"
          />

          <div v-else class="carte-moderation__actions">
            <button
              v-if="p.status === 'pending'"
              :id="idBouton(p.userId, 'approuver')"
              type="button"
              class="bouton"
              :disabled="enCours !== null"
              @click="approuver(p)"
            >
              {{ enCours === p.userId ? 'Patientez…' : 'Approuver' }}
            </button>
            <button
              v-if="p.status !== 'blocked'"
              :id="idBouton(p.userId, 'bloquer')"
              type="button"
              class="bouton bouton--secondaire"
              :disabled="enCours !== null"
              @click="ouvrir(p.userId, 'bloquer')"
            >
              Bloquer…
            </button>
            <button
              v-if="p.status === 'blocked'"
              :id="idBouton(p.userId, 'debloquer')"
              type="button"
              class="bouton"
              :disabled="enCours !== null"
              @click="debloquer(p)"
            >
              {{ enCours === p.userId ? 'Patientez…' : 'Débloquer' }}
            </button>
          </div>
        </li>
      </ul>

      <PaginationSimple
        :page="resultats.page"
        :total="resultats.total"
        :page-size="resultats.pageSize"
        etiquette="Pages de profils"
        @aller="allerPage"
      />
    </template>
  </section>
</template>
