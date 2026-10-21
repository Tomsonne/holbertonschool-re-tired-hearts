<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { fetchProfile, type PublicProfile } from '../api/decouverte';
import { ApiError } from '../api/http';
import AccesReserve from '../components/AccesReserve.vue';
import { derniereRecherche } from '../router/derniereRecherche';
import { formaterLocalisation, formaterMembreDepuis, LIBELLES_RECHERCHE } from '../formats';
import { useSessionStore } from '../stores/session';

// Fiche d'un membre (mission 10) : GET /api/profiles/:userId.
// Seuls les champs publics sont affichés, un par un : même si l'API renvoyait un champ en trop,
// il n'apparaîtrait pas à l'écran.

const route = useRoute();
const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'indisponible' | 'pret'>('chargement');
const erreur = ref('');
const membre = ref<PublicProfile | null>(null);
const accesRefuse = ref(false);

// Retour à la liste avec ses filtres et sa page.
const retour = derniereRecherche();

const recherche = computed(() => (membre.value?.lookingFor ?? []).map((r) => LIBELLES_RECHERCHE[r] ?? r).join(', '));

async function charger(): Promise<void> {
  if (!session.estApprouve) {
    accesRefuse.value = true;
    return;
  }
  etat.value = 'chargement';
  try {
    membre.value = await fetchProfile(String(route.params.userId));
    etat.value = 'pret';
    document.title = `${membre.value.displayName} — Re-Tired Hearts`;
  } catch (e) {
    // R-PROF-4 : même réponse pour un profil inconnu, en attente, bloqué, masqué ou suspendu.
    if (e instanceof ApiError && e.status === 404) {
      etat.value = 'indisponible';
      return;
    }
    if (e instanceof ApiError && (e.code === 'PROFILE_NOT_APPROVED' || e.code === 'PROFILE_BLOCKED')) {
      const u = session.utilisateur;
      if (u) session.synchroniserProfil({ displayName: u.displayName, status: e.code === 'PROFILE_BLOCKED' ? 'blocked' : 'pending' });
      accesRefuse.value = true;
      return;
    }
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(charger);
watch(() => route.params.userId, (id) => id && charger());
</script>

<template>
  <p class="lien-retour"><RouterLink :to="retour">← Retour à la liste des membres</RouterLink></p>

  <AccesReserve v-if="accesRefuse" />

  <p v-else-if="etat === 'chargement'" class="message" role="status">Chargement du profil…</p>

  <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
    <p>Ce profil n'a pas pu être chargé. {{ erreur }}</p>
    <button type="button" class="bouton" @click="charger">Réessayer</button>
  </div>

  <section v-else-if="etat === 'indisponible'" class="message" aria-labelledby="titre-indisponible">
    <h2 id="titre-indisponible">Profil indisponible</h2>
    <p>Ce profil n'est pas disponible. Le membre l'a peut-être masqué, ou il n'existe plus.</p>
  </section>

  <article v-else-if="membre" class="carte fiche-membre" aria-labelledby="titre-membre">
    <h2 id="titre-membre" class="fiche-membre__nom">{{ membre.displayName }}</h2>
    <p v-if="membre.isOrganizer" class="badge">Organisateur</p>
    <p class="fiche-membre__lieu">{{ formaterLocalisation(membre.location) }}</p>

    <!-- Texte brut : l'interpolation de Vue l'échappe, aucun HTML n'est interprété. -->
    <p v-if="membre.bio" class="fiche-membre__bio">{{ membre.bio }}</p>

    <dl class="fiche">
      <dt>Centres d'intérêt</dt>
      <dd>
        <ul v-if="membre.interests.length" class="liste-interets liste-interets--compacte">
          <li v-for="interet in membre.interests" :key="interet.id">{{ interet.label }}</li>
        </ul>
        <template v-else>Non renseignés</template>
      </dd>
      <dt>Recherche</dt>
      <dd>
        {{ recherche || 'Non précisé' }}
      </dd>
      <dt>Messages</dt>
      <dd>{{ membre.acceptsMessages ? 'Accepte les messages' : "N'accepte pas de nouveaux messages pour le moment" }}</dd>
      <dt>Membre depuis</dt>
      <dd>{{ formaterMembreDepuis(membre.memberSince) }}</dd>
    </dl>
  </article>
</template>
