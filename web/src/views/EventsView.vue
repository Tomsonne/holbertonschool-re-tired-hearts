<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Page } from '../api/decouverte';
import { ApiError } from '../api/http';
import { fetchInterests, type Interest } from '../api/interests';
import { fetchEvents, type EventSummary } from '../api/sorties';
import CarteSortie from '../components/CarteSortie.vue';
import SortiesInaccessibles from '../components/SortiesInaccessibles.vue';
// Mêmes filtres et mêmes bornes que la découverte (EventFiltersDto : page ≤ 10 000).
import { lireFiltres, versQuery } from '../router/filtresMembres';
import { DEPARTEMENT_VALIDE } from '../formats';
import { useSessionStore } from '../stores/session';

// Liste des sorties (mission 16) : GET /api/events, sorties publiées et à venir.
// Ouverte à tout compte actif dont le profil n'est pas bloqué, même en attente de vérification.
// Mêmes filtres dans l'adresse que la liste des membres (?interet=&departement=&page=).

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreur = ref('');
const resultats = ref<Page<EventSummary> | null>(null);
const interets = ref<Interest[]>([]);
const etatInterets = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const accesRefuse = ref<'suspendu' | 'bloque' | null>(null);

const champInteret = ref('');
const champDepartement = ref('');
const erreurDepartement = ref<string | null>(null);
const titreResultats = ref<HTMLElement | null>(null);

const filtres = computed(() => lireFiltres(route.query));
const filtresActifs = computed(() => filtres.value.interestId !== undefined || !!filtres.value.departmentCode);
const nombrePages = computed(() =>
  resultats.value ? Math.max(1, Math.ceil(resultats.value.total / resultats.value.pageSize)) : 1,
);
const libelleInteret = computed(
  () => interets.value.find((i) => i.id === filtres.value.interestId)?.label ?? 'ce centre d’intérêt',
);
const resume = computed(() => {
  const total = resultats.value?.total ?? 0;
  return total > 1 ? `${total} sorties à venir correspondent à votre recherche.` : '1 sortie à venir correspond à votre recherche.';
});

function lienPage(page: number) {
  return { name: 'sorties', query: versQuery({ ...filtres.value, page }) };
}

// Numéro de la dernière recherche lancée : une réponse arrivée en retard (changement rapide
// de page ou de filtre) ne doit pas écraser la plus récente.
let derniereRequete = 0;

async function charger(): Promise<void> {
  if (!session.peutVoirSorties) {
    accesRefuse.value = session.estSuspendu ? 'suspendu' : 'bloque';
    return;
  }
  const numero = ++derniereRequete;
  etat.value = 'chargement';
  erreur.value = '';
  try {
    const f = filtres.value;
    const reponse = await fetchEvents({ interestId: f.interestId, departmentCode: f.departmentCode, page: f.page });
    if (numero !== derniereRequete) return;
    resultats.value = reponse;
    etat.value = 'pret';
  } catch (e) {
    if (numero !== derniereRequete) return;
    // Statut changé depuis la connexion (profil bloqué ou compte suspendu par la modération).
    if (e instanceof ApiError && e.code === 'PROFILE_BLOCKED') {
      const u = session.utilisateur;
      if (u) session.synchroniserProfil({ displayName: u.displayName, status: 'blocked' });
      accesRefuse.value = 'bloque';
      return;
    }
    if (e instanceof ApiError && e.code === 'ACCOUNT_SUSPENDED') {
      accesRefuse.value = 'suspendu';
      return;
    }
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

function remplirChamps(): void {
  champInteret.value = filtres.value.interestId !== undefined ? String(filtres.value.interestId) : '';
  champDepartement.value = filtres.value.departmentCode ?? '';
  erreurDepartement.value = null;
}

// Référentiel des centres d'intérêt chargé à part : s'il tarde, les sorties s'affichent quand
// même ; s'il échoue, on le dit au lieu de faire disparaître le filtre.
async function chargerInterets(): Promise<void> {
  etatInterets.value = 'chargement';
  try {
    interets.value = await fetchInterests();
    etatInterets.value = 'pret';
  } catch {
    etatInterets.value = 'erreur';
  }
}

onMounted(() => {
  remplirChamps();
  if (session.peutVoirSorties) void chargerInterets();
  void charger();
});

// Changement de filtre ou de page : on recharge, puis le focus va sur les résultats.
watch(
  () => route.fullPath,
  async () => {
    if (route.name !== 'sorties') return;
    remplirChamps();
    await charger();
    await nextTick();
    titreResultats.value?.focus();
  },
);

async function rechercher(): Promise<void> {
  const departement = champDepartement.value.trim().toUpperCase();
  if (departement && !DEPARTEMENT_VALIDE.test(departement)) {
    erreurDepartement.value = 'Saisissez le numéro du département, par exemple 31, 2A ou 974.';
    await nextTick();
    document.getElementById('filtre-sorties-departement')?.focus();
    return;
  }
  erreurDepartement.value = null;
  const query = versQuery({
    interestId: champInteret.value ? Number(champInteret.value) : undefined,
    departmentCode: departement || undefined,
    page: 1,
  });
  if (router.resolve({ name: 'sorties', query }).fullPath === route.fullPath) {
    await charger();
    await nextTick();
    titreResultats.value?.focus();
    return;
  }
  await router.push({ name: 'sorties', query });
}

async function effacerFiltres(): Promise<void> {
  champInteret.value = '';
  champDepartement.value = '';
  erreurDepartement.value = null;
  await router.push({ name: 'sorties' });
}
</script>

<template>
  <h2 class="titre-orne">Les sorties</h2>

  <SortiesInaccessibles v-if="accesRefuse" :raison="accesRefuse" />

  <template v-else>
    <p>Des activités près de chez vous, proposées par les membres organisateurs.</p>
    <p v-if="!session.estApprouve" class="message message--info">
      Vous pouvez consulter les sorties dès maintenant. Pour vous inscrire, votre profil doit d'abord être approuvé :
      <RouterLink :to="{ name: 'mon-profil' }">vérifier mon profil</RouterLink>.
    </p>

    <section class="carte filtres" aria-labelledby="titre-filtres-sorties">
      <h3 id="titre-filtres-sorties">Affiner la recherche</h3>
      <form novalidate @submit.prevent="rechercher">
        <div class="filtres__champs">
          <div class="champ">
            <label for="filtre-sorties-interet">Centre d'intérêt</label>
            <p id="filtre-sorties-interet-aide" class="champ__aide">Le thème principal de la sortie.</p>
            <select
              id="filtre-sorties-interet"
              v-model="champInteret"
              name="interet"
              :disabled="etatInterets === 'erreur'"
              :aria-describedby="
                etatInterets === 'erreur'
                  ? 'filtre-sorties-interet-aide filtre-sorties-interet-erreur'
                  : 'filtre-sorties-interet-aide'
              "
            >
              <option value="">
                {{ etatInterets === 'chargement' ? 'Chargement des centres d’intérêt…' : 'Tous les centres d\'intérêt' }}
              </option>
              <option v-for="interet in interets" :key="interet.id" :value="String(interet.id)">
                {{ interet.label }}
              </option>
            </select>
            <div v-if="etatInterets === 'erreur'" id="filtre-sorties-interet-erreur" class="champ__erreur" role="alert">
              <p>La liste des centres d'intérêt n'a pas pu être chargée : ce filtre est indisponible pour l'instant.</p>
              <button type="button" class="bouton bouton--secondaire" @click="chargerInterets">Réessayer</button>
            </div>
          </div>
          <div class="champ">
            <label for="filtre-sorties-departement">Département</label>
            <p id="filtre-sorties-departement-aide" class="champ__aide">Son numéro, par exemple 31. Vide : toute la France.</p>
            <input
              id="filtre-sorties-departement"
              v-model="champDepartement"
              type="text"
              name="departement"
              maxlength="3"
              autocomplete="off"
              :aria-invalid="erreurDepartement ? 'true' : undefined"
              :aria-describedby="
                erreurDepartement
                  ? 'filtre-sorties-departement-aide filtre-sorties-departement-erreur'
                  : 'filtre-sorties-departement-aide'
              "
            />
            <p v-if="erreurDepartement" id="filtre-sorties-departement-erreur" class="champ__erreur">
              {{ erreurDepartement }}
            </p>
          </div>
        </div>
        <div class="filtres__actions">
          <button type="submit" class="bouton">Rechercher</button>
          <button v-if="filtresActifs" type="button" class="bouton bouton--secondaire" @click="effacerFiltres">
            Effacer les filtres
          </button>
        </div>
      </form>
    </section>

    <section class="resultats" aria-labelledby="titre-resultats-sorties">
      <h3 id="titre-resultats-sorties" ref="titreResultats" tabindex="-1">Sorties à venir</h3>

      <p v-if="etat === 'chargement'" class="message" role="status">Recherche des sorties…</p>

      <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
        <p>La liste des sorties n'a pas pu être chargée. {{ erreur }}</p>
        <button type="button" class="bouton" @click="charger">Réessayer</button>
      </div>

      <template v-else-if="resultats">
        <div v-if="resultats.items.length === 0" class="message" role="status">
          <template v-if="resultats.total > 0">
            <p>Cette page n'existe pas : la liste ne compte que {{ nombrePages }} page{{ nombrePages > 1 ? 's' : '' }}.</p>
            <p><RouterLink :to="lienPage(1)">Revenir à la première page</RouterLink></p>
          </template>
          <template v-else-if="filtresActifs">
            <p>
              Aucune sortie à venir ne correspond à votre recherche
              <template v-if="filtres.interestId !== undefined"> pour « {{ libelleInteret }} »</template>
              <template v-if="filtres.departmentCode"> dans le département {{ filtres.departmentCode }}</template>.
            </p>
            <p>Essayez un autre centre d'intérêt ou un département voisin.</p>
            <button type="button" class="bouton bouton--secondaire" @click="effacerFiltres">Voir toutes les sorties</button>
          </template>
          <p v-else>Aucune sortie n'est prévue pour le moment. Revenez bientôt !</p>
        </div>

        <template v-else>
          <p class="resultats__resume" role="status">
            {{ resume }}
            <template v-if="nombrePages > 1"> Page {{ resultats.page }} sur {{ nombrePages }}.</template>
          </p>

          <ul class="liste-sorties">
            <!-- Les filtres suivent dans l'adresse de la fiche, pour le lien de retour. -->
            <CarteSortie
              v-for="sortie in resultats.items"
              :key="sortie.id"
              :sortie="sortie"
              :lien="{ name: 'sortie', params: { eventId: sortie.id }, query: versQuery(filtres) }"
            />
          </ul>

          <nav v-if="nombrePages > 1" class="pagination" aria-label="Pages de sorties">
            <RouterLink
              v-if="resultats.page > 1"
              class="bouton bouton--secondaire"
              :to="lienPage(resultats.page - 1)"
              rel="prev"
            >
              Page précédente
            </RouterLink>
            <p class="pagination__position">Page {{ resultats.page }} sur {{ nombrePages }}</p>
            <RouterLink
              v-if="resultats.page < nombrePages"
              class="bouton bouton--secondaire"
              :to="lienPage(resultats.page + 1)"
              rel="next"
            >
              Page suivante
            </RouterLink>
          </nav>
        </template>
      </template>
    </section>
  </template>
</template>
