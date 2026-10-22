<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import {
  changerRole,
  fetchComptesModeration,
  MOTIF,
  reactiverCompte,
  suspendreCompte,
  type ModerationUser,
  type StatutCompte,
} from '../api/moderation';
import ConfirmationAction from '../components/ConfirmationAction.vue';
import NavModeration from '../components/NavModeration.vue';
import PaginationSimple from '../components/PaginationSimple.vue';
import { idBouton, idRetour, useActionsModeration } from '../composables/actionsModeration';
import { formaterDate } from '../formats';

// File des comptes (mission 25) : GET /api/moderation/users, recherche par nom ou e-mail.
// Suspendre (motif obligatoire), réactiver, attribuer ou retirer le rôle d'organisateur.

const ROLES: Record<string, string> = { member: 'Membre', organizer: 'Organisateur', moderator: 'Modérateur' };
const PROFILS: Record<string, string> = { pending: 'en attente', approved: 'approuvé', blocked: 'bloqué' };

const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreur = ref('');
const resultats = ref<Page<ModerationUser> | null>(null);
const recherche = ref('');
const statut = ref<StatutCompte | ''>('');
// Critères réellement appliqués (le champ peut changer sans relancer la recherche).
const appliques = ref<{ q: string; status: StatutCompte | '' }>({ q: '', status: '' });
const page = ref(1);
const titreListe = ref<HTMLElement | null>(null);

const actions = useActionsModeration();
const { estOuverte, ouvrir, renoncer, retours, enCours, erreurMotifApi } = actions;

const nom = (u: ModerationUser) => u.displayName ?? u.email;

async function charger(focus = false): Promise<void> {
  etat.value = 'chargement';
  erreur.value = '';
  try {
    resultats.value = await fetchComptesModeration({
      q: appliques.value.q || undefined,
      status: appliques.value.status || undefined,
      page: page.value,
    });
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

function rechercher(): void {
  appliques.value = { q: recherche.value.trim(), status: statut.value };
  page.value = 1;
  void charger(true);
}

function allerPage(n: number): void {
  page.value = n;
  void charger(true);
}

function remplacer(u: ModerationUser): void {
  if (!resultats.value) return;
  resultats.value.items = resultats.value.items.map((x) => (x.id === u.id ? u : x));
}

async function suspendre(u: ModerationUser, motif?: string): Promise<void> {
  const r = await actions.executer(
    u.id,
    () => suspendreCompte(u.id, motif ?? ''),
    `Le compte de ${nom(u)} est suspendu : ses sessions sont fermées et ses places aux sorties à venir libérées.`,
  );
  if (r) remplacer(r);
}

async function reactiver(u: ModerationUser): Promise<void> {
  // R-MOD-4 : les inscriptions libérées par la suspension ne reviennent pas.
  const r = await actions.executer(
    u.id,
    () => reactiverCompte(u.id),
    `Le compte de ${nom(u)} est réactivé. Ses anciennes inscriptions ne sont pas rétablies : il devra se réinscrire.`,
  );
  if (r) remplacer(r);
}

async function basculerRole(u: ModerationUser): Promise<void> {
  const nouveau = u.role === 'organizer' ? 'member' : 'organizer';
  const r = await actions.executer(
    u.id,
    () => changerRole(u.id, nouveau),
    nouveau === 'organizer'
      ? `${nom(u)} est maintenant organisateur : il peut créer des sorties.`
      : `${nom(u)} n'est plus organisateur.`,
  );
  if (r) remplacer(r);
}
</script>

<template>
  <h2 class="titre-orne">Modération</h2>
  <NavModeration />

  <section class="moderation" aria-labelledby="titre-comptes">
    <form class="carte filtres" novalidate role="search" aria-label="Rechercher un compte" @submit.prevent="rechercher">
      <div class="filtres__champs">
        <div class="champ">
          <label for="recherche-compte">Nom ou e-mail</label>
          <input id="recherche-compte" v-model="recherche" type="search" name="q" maxlength="254" autocomplete="off" />
        </div>
        <div class="champ">
          <label for="filtre-statut-compte">État du compte</label>
          <select id="filtre-statut-compte" v-model="statut" name="status">
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
          </select>
        </div>
      </div>
      <button type="submit" class="bouton">Rechercher</button>
    </form>

    <h3 id="titre-comptes" ref="titreListe" tabindex="-1">
      Comptes{{ resultats && etat === 'pret' ? ` (${resultats.total})` : '' }}
    </h3>

    <p v-if="etat === 'chargement'" class="message" role="status">Chargement des comptes…</p>

    <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
      <p>La liste des comptes n'a pas pu être chargée. {{ erreur }}</p>
      <button type="button" class="bouton" @click="charger()">Réessayer</button>
    </div>

    <p v-else-if="resultats && resultats.items.length === 0" class="message" role="status">
      Aucun compte ne correspond{{ appliques.q ? ` à « ${appliques.q} »` : '' }}.
    </p>

    <template v-else-if="resultats">
      <ul class="liste-moderation">
        <li v-for="u in resultats.items" :key="u.id" class="carte carte-moderation">
          <h4 class="carte-moderation__titre">{{ u.displayName ?? 'Profil non créé' }}</h4>
          <p class="badge" :class="u.status === 'suspended' ? 'badge--annulee' : 'badge--ouverte'">
            {{ u.status === 'suspended' ? 'Suspendu' : 'Actif' }}
          </p>
          <dl class="fiche">
            <dt>E-mail</dt>
            <dd>{{ u.email }}</dd>
            <dt>Rôle</dt>
            <dd>{{ ROLES[u.role] }}</dd>
            <dt>Profil</dt>
            <dd>{{ u.profileStatus ? PROFILS[u.profileStatus] : 'non créé' }}</dd>
            <dt>Inscrit</dt>
            <dd>{{ formaterDate(u.createdAt) }}</dd>
          </dl>

          <p
            v-if="retours[u.id]"
            :id="idRetour(u.id)"
            class="message"
            :class="retours[u.id].type === 'erreur' ? 'message--erreur' : 'message--succes'"
            :role="retours[u.id].type === 'erreur' ? 'alert' : 'status'"
            tabindex="-1"
          >
            {{ retours[u.id].texte }}
          </p>

          <p v-if="u.role === 'moderator'" class="champ__aide">Compte modérateur : aucune action possible.</p>

          <ConfirmationAction
            v-else-if="estOuverte(u.id, 'suspendre')"
            :id="`suspendre-${u.id}`"
            :question="`Suspendre le compte de ${nom(u)} (${u.email}) ? Ses sessions seront fermées et il sera désinscrit des sorties à venir. S'il organise des sorties, elles ne sont pas annulées : faites-le depuis la file des sorties.`"
            :libelle-confirmer="`Oui, suspendre ${nom(u)}`"
            motif="obligatoire"
            :motif-max="MOTIF.max"
            aide-motif="Il est enregistré dans le journal de modération."
            :en-cours="enCours === u.id"
            :erreur-motif-api="erreurMotifApi"
            @confirmer="(m) => suspendre(u, m)"
            @renoncer="renoncer"
          />

          <ConfirmationAction
            v-else-if="estOuverte(u.id, 'role')"
            :id="`role-${u.id}`"
            :question="
              u.role === 'organizer'
                ? `Retirer le rôle d'organisateur à ${nom(u)} ? Il ne pourra plus créer ni gérer de sorties. Ses sorties déjà publiées resteront en ligne, sans personne pour les gérer.`
                : `Nommer ${nom(u)} organisateur ? Il pourra créer et publier des sorties.`
            "
            :libelle-confirmer="u.role === 'organizer' ? 'Oui, retirer le rôle' : 'Oui, nommer organisateur'"
            :en-cours="enCours === u.id"
            @confirmer="basculerRole(u)"
            @renoncer="renoncer"
          />

          <div v-else class="carte-moderation__actions">
            <button
              v-if="u.status === 'active'"
              :id="idBouton(u.id, 'suspendre')"
              type="button"
              class="bouton bouton--secondaire"
              :disabled="enCours !== null"
              @click="ouvrir(u.id, 'suspendre')"
            >
              Suspendre…
            </button>
            <button
              v-else
              :id="idBouton(u.id, 'reactiver')"
              type="button"
              class="bouton"
              :disabled="enCours !== null"
              @click="reactiver(u)"
            >
              {{ enCours === u.id ? 'Patientez…' : 'Réactiver' }}
            </button>
            <button
              :id="idBouton(u.id, 'role')"
              type="button"
              class="bouton bouton--secondaire"
              :disabled="enCours !== null"
              @click="ouvrir(u.id, 'role')"
            >
              {{ u.role === 'organizer' ? 'Retirer le rôle d’organisateur…' : 'Nommer organisateur…' }}
            </button>
          </div>
        </li>
      </ul>

      <PaginationSimple
        :page="resultats.page"
        :total="resultats.total"
        :page-size="resultats.pageSize"
        etiquette="Pages de comptes"
        @aller="allerPage"
      />
    </template>
  </section>
</template>
