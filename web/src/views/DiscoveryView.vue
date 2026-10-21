<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import { fetchProfiles, type Page, type PublicProfile } from '../api/decouverte';
import { ApiError } from '../api/http';
import { fetchInterests, type Interest } from '../api/interests';
import AccesReserve from '../components/AccesReserve.vue';
import { memoriserRecherche } from '../router/derniereRecherche';
import { DEPARTEMENT_VALIDE, formaterLocalisation, formaterMembreDepuis } from '../formats';
import { useSessionStore } from '../stores/session';

// Découverte des membres (mission 10) : GET /api/profiles, réservé aux profils approuvés.
// Les filtres et la page sont dans l'adresse (?interet=&departement=&page=) : le bouton
// « Précédent » du navigateur, le rechargement et le retour depuis une fiche les conservent.

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreur = ref('');
const resultats = ref<Page<PublicProfile> | null>(null);
const interets = ref<Interest[]>([]);
const accesRefuse = ref(false);

const champInteret = ref('');
const champDepartement = ref('');
const erreurDepartement = ref<string | null>(null);
const titreResultats = ref<HTMLElement | null>(null);

type Filtres = { interestId?: number; departmentCode?: string; page: number };

// Une adresse modifiée à la main ne doit jamais casser l'écran : on ignore ce qui est invalide.
function lireFiltres(query: LocationQuery): Filtres {
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const interet = Number(texte(query.interet));
  const departement = texte(query.departement).toUpperCase();
  const page = Number(texte(query.page));
  return {
    interestId: Number.isInteger(interet) && interet > 0 ? interet : undefined,
    departmentCode: DEPARTEMENT_VALIDE.test(departement) ? departement : undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function versQuery(f: Filtres): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.interestId !== undefined) q.interet = String(f.interestId);
  if (f.departmentCode) q.departement = f.departmentCode;
  if (f.page > 1) q.page = String(f.page);
  return q;
}

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
  const membres = total > 1 ? `${total} membres correspondent` : total === 1 ? '1 membre correspond' : '';
  return `${membres} à votre recherche.`;
});

function lienPage(page: number) {
  return { name: 'membres', query: versQuery({ ...filtres.value, page }) };
}

async function charger(): Promise<void> {
  if (!session.estApprouve) {
    accesRefuse.value = true;
    return;
  }
  etat.value = 'chargement';
  erreur.value = '';
  memoriserRecherche(route.fullPath);
  try {
    const f = filtres.value;
    resultats.value = await fetchProfiles({ interestId: f.interestId, departmentCode: f.departmentCode, page: f.page });
    etat.value = 'pret';
  } catch (e) {
    // Statut changé depuis la connexion (profil bloqué ou repassé en attente).
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

function remplirChamps(): void {
  champInteret.value = filtres.value.interestId !== undefined ? String(filtres.value.interestId) : '';
  champDepartement.value = filtres.value.departmentCode ?? '';
  erreurDepartement.value = null;
}

onMounted(async () => {
  remplirChamps();
  if (session.estApprouve) interets.value = await fetchInterests().catch(() => []);
  await charger();
});

// Changement de filtre ou de page : on recharge, puis on place le focus sur les résultats
// pour que la personne au clavier ou au lecteur d'écran sache que la liste a changé.
watch(
  () => route.fullPath,
  async () => {
    if (route.name !== 'membres') return;
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
    document.getElementById('filtre-departement')?.focus();
    return;
  }
  erreurDepartement.value = null;
  const interet = Number(champInteret.value);
  const query = versQuery({
    interestId: champInteret.value ? interet : undefined,
    departmentCode: departement || undefined,
    page: 1,
  });
  // Même recherche relancée : l'adresse ne change pas, on recharge quand même.
  if (router.resolve({ name: 'membres', query }).fullPath === route.fullPath) {
    await charger();
    await nextTick();
    titreResultats.value?.focus();
    return;
  }
  await router.push({ name: 'membres', query });
}

async function effacerFiltres(): Promise<void> {
  champInteret.value = '';
  champDepartement.value = '';
  erreurDepartement.value = null;
  await router.push({ name: 'membres' });
}
</script>

<template>
  <h2 class="titre-orne">Les membres</h2>

  <AccesReserve v-if="accesRefuse" />

  <template v-else>
    <p>Retrouvez des personnes qui partagent vos centres d'intérêt, près de chez vous.</p>

    <section class="carte filtres" aria-labelledby="titre-filtres">
      <h3 id="titre-filtres">Affiner la recherche</h3>
      <form novalidate @submit.prevent="rechercher">
        <div class="filtres__champs">
          <div class="champ">
            <label for="filtre-interet">Centre d'intérêt</label>
            <p id="filtre-interet-aide" class="champ__aide">Un thème à la fois.</p>
            <select id="filtre-interet" v-model="champInteret" name="interet" aria-describedby="filtre-interet-aide">
              <option value="">Tous les centres d'intérêt</option>
              <option v-for="interet in interets" :key="interet.id" :value="String(interet.id)">
                {{ interet.label }}
              </option>
            </select>
          </div>
          <div class="champ">
            <label for="filtre-departement">Département</label>
            <p id="filtre-departement-aide" class="champ__aide">Son numéro, par exemple 31. Vide : toute la France.</p>
            <input
              id="filtre-departement"
              v-model="champDepartement"
              type="text"
              name="departement"
              maxlength="3"
              autocomplete="off"
              :aria-invalid="erreurDepartement ? 'true' : undefined"
              :aria-describedby="erreurDepartement ? 'filtre-departement-aide filtre-departement-erreur' : 'filtre-departement-aide'"
            />
            <p v-if="erreurDepartement" id="filtre-departement-erreur" class="champ__erreur">{{ erreurDepartement }}</p>
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

    <section class="resultats" aria-labelledby="titre-resultats">
      <h3 id="titre-resultats" ref="titreResultats" tabindex="-1">Résultats</h3>

      <p v-if="etat === 'chargement'" class="message" role="status">Recherche des membres…</p>

      <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
        <p>La liste des membres n'a pas pu être chargée. {{ erreur }}</p>
        <button type="button" class="bouton" @click="charger">Réessayer</button>
      </div>

      <template v-else-if="resultats">
        <!-- Aucun résultat : on dit pourquoi et on propose quoi faire. -->
        <div v-if="resultats.items.length === 0" class="message" role="status">
          <template v-if="resultats.total > 0">
            <p>Cette page n'existe pas : la liste ne compte que {{ nombrePages }} page{{ nombrePages > 1 ? 's' : '' }}.</p>
            <p><RouterLink :to="lienPage(1)">Revenir à la première page</RouterLink></p>
          </template>
          <template v-else-if="filtresActifs">
            <p>
              Aucun membre ne correspond à votre recherche
              <template v-if="filtres.interestId !== undefined"> pour « {{ libelleInteret }} »</template>
              <template v-if="filtres.departmentCode"> dans le département {{ filtres.departmentCode }}</template>.
            </p>
            <p>Essayez un autre centre d'intérêt ou un département voisin.</p>
            <button type="button" class="bouton bouton--secondaire" @click="effacerFiltres">Voir tous les membres</button>
          </template>
          <p v-else>Aucun autre membre n'est visible pour le moment. Revenez bientôt !</p>
        </div>

        <template v-else>
          <p class="resultats__resume" role="status">
            {{ resume }}
            <template v-if="nombrePages > 1"> Page {{ resultats.page }} sur {{ nombrePages }}.</template>
          </p>

          <ul class="liste-membres">
            <li v-for="membre in resultats.items" :key="membre.userId" class="carte carte-membre">
              <h4 class="carte-membre__nom">
                <RouterLink :to="{ name: 'membre', params: { userId: membre.userId } }">{{ membre.displayName }}</RouterLink>
              </h4>
              <p v-if="membre.isOrganizer" class="badge">Organisateur</p>
              <p class="carte-membre__lieu">{{ formaterLocalisation(membre.location) }}</p>
              <ul v-if="membre.interests.length" class="liste-interets liste-interets--compacte" aria-label="Centres d'intérêt">
                <li v-for="interet in membre.interests" :key="interet.id">{{ interet.label }}</li>
              </ul>
              <p class="carte-membre__detail">
                Membre depuis {{ formaterMembreDepuis(membre.memberSince) }}
                <template v-if="membre.acceptsMessages"> · Accepte les messages</template>
              </p>
            </li>
          </ul>

          <nav v-if="nombrePages > 1" class="pagination" aria-label="Pages de résultats">
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
