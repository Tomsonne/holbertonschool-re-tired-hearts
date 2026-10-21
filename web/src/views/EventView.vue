<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../api/http';
import { desinscrire, fetchEvent, inscrire, type EventDetail } from '../api/sorties';
import SortiesInaccessibles from '../components/SortiesInaccessibles.vue';
import { lireFiltres, versQuery } from '../router/filtresMembres';
import { etatSortie, formaterHoraire, formaterLocalisation, formaterPlaces } from '../formats';
import { useSessionStore } from '../stores/session';

// Détail d'une sortie (mission 16) : GET /api/events/:id, puis inscription
// (POST /registration) et désinscription (DELETE /registration).
// L'écran n'invente aucune règle : l'API dit si l'inscription est possible (canRegister) et
// pourquoi elle ne l'est pas (registrationBlockedReason). Elle refait ses contrôles à chaque
// demande ; l'écran affiche alors sa réponse et se met à jour.

const route = useRoute();
const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'indisponible' | 'pret'>('chargement');
const erreur = ref('');
const sortie = ref<EventDetail | null>(null);
const accesRefuse = ref<'suspendu' | 'bloque' | null>(null);

const actionEnCours = ref<'inscription' | 'desinscription' | null>(null);
const confirmationDemandee = ref(false);
const retour = ref<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
const zoneRetour = ref<HTMLElement | null>(null);
const zoneConfirmation = ref<HTMLElement | null>(null);
const boutonDesinscription = ref<HTMLButtonElement | null>(null);

// Retour à la liste avec ses filtres : la fiche les garde dans sa propre adresse
// (/sorties/:id?departement=31), relus et nettoyés comme sur la fiche d'un membre.
const retourListe = computed(() => ({ name: 'sorties', query: versQuery(lireFiltres(route.query)) }));
// Une fiche demandée avant une autre (ou relue après une action) ne doit pas l'écraser.
let derniereRequete = 0;
let generationFiche = 0;
const identifiant = () => String(route.params.eventId);
type ContexteFiche = { id: string; generation: number };
const contexte = (): ContexteFiche => ({ id: sortie.value!.id, generation: generationFiche });
const estCourant = (operation: ContexteFiche): boolean =>
  operation.generation === generationFiche && identifiant() === operation.id && sortie.value?.id === operation.id;

const etatAffiche = computed(() => (sortie.value ? etatSortie(sortie.value) : null));
const estInscrit = computed(() => sortie.value?.myRegistration === 'registered');
// Annulée ou terminée : plus rien à faire, le bandeau suffit (R-EVT-8).
const estOuverte = computed(() => etatAffiche.value === 'ouverte' || etatAffiche.value === 'complete');
const lienOrganisateur = computed(() => session.estApprouve && !sortie.value?.isOrganizer);

function gererRefusDAcces(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.code === 'PROFILE_BLOCKED') {
    const u = session.utilisateur;
    if (u) session.synchroniserProfil({ displayName: u.displayName, status: 'blocked' });
    accesRefuse.value = 'bloque';
    return true;
  }
  if (e.code === 'ACCOUNT_SUSPENDED') {
    accesRefuse.value = 'suspendu';
    return true;
  }
  return false;
}

async function charger(): Promise<void> {
  ++generationFiche;
  const numero = ++derniereRequete;
  const id = identifiant();
  actionEnCours.value = null;
  rechargementAdresse.value = null;
  if (!session.peutVoirSorties) {
    accesRefuse.value = session.estSuspendu ? 'suspendu' : 'bloque';
    return;
  }
  etat.value = 'chargement';
  retour.value = null;
  confirmationDemandee.value = false;
  try {
    const reponse = await fetchEvent(id);
    if (numero !== derniereRequete) return;
    sortie.value = reponse;
    etat.value = 'pret';
    document.title = `${sortie.value.title} — Re-Tired Hearts`;
  } catch (e) {
    if (numero !== derniereRequete) return;
    // Même réponse pour une sortie inconnue, un brouillon ou une sortie annulée d'autrui.
    if (e instanceof ApiError && e.status === 404) {
      etat.value = 'indisponible';
      return;
    }
    if (gererRefusDAcces(e)) return;
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

// Relecture discrète après une action : places, adresse exacte et boutons à jour.
// En cas d'échec, on garde ce qui est affiché (déjà corrigé avec la réponse de l'action).
// Renvoie true seulement si la fiche affichée vient d'être relue : l'appelant ne doit jamais
// annoncer une information (ex. l'adresse exacte) que la relecture n'a pas apportée.
async function rafraichir(operation: ContexteFiche): Promise<boolean> {
  if (!estCourant(operation)) return false;
  const numero = ++derniereRequete;
  try {
    const reponse = await fetchEvent(operation.id);
    if (numero !== derniereRequete || !estCourant(operation)) return false;
    sortie.value = reponse;
    return true;
  } catch {
    return false;
  }
}

// Inscrit, mais adresse absente : la relecture a échoué. On le dit et on propose de réessayer.
const adresseManquante = computed(
  () => !!sortie.value && estInscrit.value && !sortie.value.isOrganizer && !sortie.value.exactAddress,
);
const rechargementAdresse = ref<'en-cours' | 'echec' | null>(null);

async function rechargerAdresse(): Promise<void> {
  if (!sortie.value) return;
  const operation = contexte();
  rechargementAdresse.value = 'en-cours';
  const relue = await rafraichir(operation);
  if (!estCourant(operation)) return;
  rechargementAdresse.value = relue && sortie.value?.exactAddress ? null : 'echec';
}

async function annoncer(operation: ContexteFiche, type: 'succes' | 'erreur', texte: string): Promise<void> {
  if (!estCourant(operation)) return;
  retour.value = { type, texte };
  // Le bouton cliqué disparaît ou change : le focus va sur le message, qui est lu aussitôt.
  await nextTick();
  if (estCourant(operation)) zoneRetour.value?.focus();
}

async function traiterEchec(e: unknown, operation: ContexteFiche): Promise<void> {
  if (!estCourant(operation)) return;
  if (e instanceof ApiError && e.status === 404 && e.code === 'EVENT_NOT_FOUND') {
    etat.value = 'indisponible';
    return;
  }
  if (gererRefusDAcces(e)) return;
  if (e instanceof ApiError && e.code === 'PROFILE_NOT_APPROVED') {
    const u = session.utilisateur;
    if (u) session.synchroniserProfil({ displayName: u.displayName, status: 'pending' });
  }
  // Complet, déjà commencé, déjà inscrit… : le message de l'API est fait pour être lu tel quel.
  await rafraichir(operation);
  await annoncer(operation, 'erreur', e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.');
}

async function sInscrire(): Promise<void> {
  if (!sortie.value || actionEnCours.value) return;
  const operation = contexte();
  const titre = sortie.value.title;
  actionEnCours.value = 'inscription';
  retour.value = null;
  try {
    const resultat = await inscrire(operation.id);
    if (!estCourant(operation)) return;
    sortie.value = { ...sortie.value, myRegistration: resultat.status, availablePlaces: resultat.availablePlaces, canRegister: false };
    rechargementAdresse.value = null;
    const relue = await rafraichir(operation);
    await annoncer(
      operation,
      'succes',
      relue && sortie.value?.exactAddress
        ? `Vous êtes inscrit à « ${titre} ». L'adresse exacte du rendez-vous est maintenant affichée.`
        : `Vous êtes inscrit à « ${titre} ». L'adresse exacte n'a pas pu être chargée pour l'instant : ` +
            'utilisez le bouton « Afficher l’adresse exacte ».',
    );
  } catch (e) {
    await traiterEchec(e, operation);
  } finally {
    if (estCourant(operation)) actionEnCours.value = null;
  }
}

async function demanderDesinscription(): Promise<void> {
  retour.value = null;
  confirmationDemandee.value = true;
  await nextTick();
  zoneConfirmation.value?.focus();
}

async function garderMaPlace(): Promise<void> {
  confirmationDemandee.value = false;
  await nextTick();
  boutonDesinscription.value?.focus();
}

async function seDesinscrire(): Promise<void> {
  if (!sortie.value || actionEnCours.value) return;
  const operation = contexte();
  const titre = sortie.value.title;
  actionEnCours.value = 'desinscription';
  try {
    const resultat = await desinscrire(operation.id);
    if (!estCourant(operation)) return;
    sortie.value = {
      ...sortie.value,
      myRegistration: resultat.status,
      availablePlaces: resultat.availablePlaces,
      exactAddress: sortie.value.isOrganizer ? sortie.value.exactAddress : null,
    };
    confirmationDemandee.value = false;
    await rafraichir(operation);
    await annoncer(operation, 'succes', `Vous n'êtes plus inscrit à « ${titre} ». Votre place est libérée pour un autre membre.`);
  } catch (e) {
    if (!estCourant(operation)) return;
    confirmationDemandee.value = false;
    await traiterEchec(e, operation);
  } finally {
    if (estCourant(operation)) actionEnCours.value = null;
  }
}

onMounted(charger);
onBeforeUnmount(() => { ++generationFiche; ++derniereRequete; });
watch(() => route.params.eventId, (id) => id && charger());
</script>

<template>
  <p class="lien-retour"><RouterLink :to="retourListe">← Retour à la liste des sorties</RouterLink></p>

  <SortiesInaccessibles v-if="accesRefuse" :raison="accesRefuse" />

  <p v-else-if="etat === 'chargement'" class="message" role="status">Chargement de la sortie…</p>

  <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
    <p>Cette sortie n'a pas pu être chargée. {{ erreur }}</p>
    <button type="button" class="bouton" @click="charger">Réessayer</button>
  </div>

  <section v-else-if="etat === 'indisponible'" class="message" aria-labelledby="titre-sortie-indisponible">
    <h2 id="titre-sortie-indisponible">Sortie indisponible</h2>
    <p>Cette sortie n'est pas disponible. Elle a peut-être été retirée, ou elle n'est pas encore publiée.</p>
    <p><RouterLink :to="{ name: 'sorties' }">Voir les sorties à venir</RouterLink></p>
  </section>

  <article v-else-if="sortie" class="fiche-sortie" aria-labelledby="titre-sortie">
    <h2 id="titre-sortie" class="fiche-sortie__titre">{{ sortie.title }}</h2>
    <p class="surtitre">{{ sortie.interest.label }}</p>

    <!-- Bandeau de statut : le titre dit le statut en toutes lettres, la couleur n'est qu'un appui. -->
    <section
      v-if="etatAffiche === 'annulee'"
      class="message message--erreur bandeau-sortie"
      aria-labelledby="titre-bandeau-sortie"
    >
      <h3 id="titre-bandeau-sortie">Sortie annulée</h3>
      <p>Cette sortie n'aura pas lieu.</p>
      <p v-if="sortie.cancellationReason">Motif donné par l'organisateur : {{ sortie.cancellationReason }}</p>
    </section>
    <section v-else-if="etatAffiche === 'terminee'" class="message bandeau-sortie" aria-labelledby="titre-bandeau-sortie">
      <h3 id="titre-bandeau-sortie">Sortie terminée</h3>
      <p>Cette sortie a déjà eu lieu : elle ne prend plus d'inscriptions.</p>
    </section>
    <section v-else-if="estInscrit" class="message message--succes bandeau-sortie" aria-labelledby="titre-bandeau-sortie">
      <h3 id="titre-bandeau-sortie">Vous êtes inscrit</h3>
      <p>Votre place est réservée pour cette sortie.</p>
    </section>
    <section
      v-else-if="etatAffiche === 'complete'"
      class="message message--info bandeau-sortie"
      aria-labelledby="titre-bandeau-sortie"
    >
      <h3 id="titre-bandeau-sortie">Sortie complète</h3>
      <p>Toutes les places sont prises. Si une personne se désinscrit, une place se libérera : revenez plus tard.</p>
    </section>

    <div class="fiche-sortie__corps">
      <div class="carte">
        <!-- Texte brut : l'interpolation de Vue l'échappe, aucun HTML n'est interprété. -->
        <p class="fiche-sortie__description">{{ sortie.description }}</p>

        <dl class="fiche">
          <dt>Date</dt>
          <dd><time :datetime="sortie.startsAt">{{ formaterHoraire(sortie.startsAt, sortie.endsAt) }}</time></dd>
          <dt>Lieu</dt>
          <dd>
            {{ formaterLocalisation(sortie.location) }}
            <template v-if="sortie.areaHint"><br />{{ sortie.areaHint }}</template>
          </dd>
          <dt>Adresse exacte</dt>
          <dd>
            <template v-if="sortie.exactAddress">{{ sortie.exactAddress }}</template>
            <div v-else-if="adresseManquante" class="adresse-manquante">
              <p>Vous êtes inscrit, mais l'adresse n'a pas pu être chargée.</p>
              <p v-if="rechargementAdresse === 'echec'" class="champ__erreur" role="alert">
                L'adresse n'a toujours pas pu être chargée. Vérifiez votre connexion internet, puis réessayez.
              </p>
              <button
                type="button"
                class="bouton bouton--secondaire"
                :disabled="rechargementAdresse === 'en-cours'"
                @click="rechargerAdresse"
              >
                {{ rechargementAdresse === 'en-cours' ? 'Chargement…' : 'Afficher l’adresse exacte' }}
              </button>
            </div>
            <template v-else>Communiquée uniquement aux personnes inscrites.</template>
          </dd>
          <dt>Organisée par</dt>
          <dd>
            <template v-if="sortie.isOrganizer">Vous</template>
            <RouterLink
              v-else-if="lienOrganisateur"
              :to="{ name: 'membre', params: { userId: sortie.organizer.userId } }"
            >
              {{ sortie.organizer.displayName }}
            </RouterLink>
            <template v-else>{{ sortie.organizer.displayName }}</template>
          </dd>
          <!-- Annulée ou terminée : des places « restantes » n'auraient plus de sens. -->
          <template v-if="estOuverte">
            <dt>Places</dt>
            <dd>{{ formaterPlaces(sortie) }}</dd>
          </template>
        </dl>
      </div>

      <section class="carte inscription-sortie" aria-labelledby="titre-inscription">
        <h3 id="titre-inscription">Participation</h3>

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

        <template v-if="!estOuverte">
          <p>Les inscriptions sont fermées pour cette sortie.</p>
        </template>

        <template v-else-if="estInscrit">
          <div
            v-if="confirmationDemandee"
            ref="zoneConfirmation"
            class="confirmation"
            role="group"
            aria-labelledby="question-desinscription"
            tabindex="-1"
          >
            <p id="question-desinscription">
              Voulez-vous vraiment vous désinscrire de « {{ sortie.title }} » ? Votre place sera proposée
              aux autres membres.
            </p>
            <div class="confirmation__actions">
              <button type="button" class="bouton" :disabled="actionEnCours !== null" @click="seDesinscrire">
                {{ actionEnCours === 'desinscription' ? 'Désinscription…' : 'Oui, me désinscrire' }}
              </button>
              <button
                type="button"
                class="bouton bouton--secondaire"
                :disabled="actionEnCours !== null"
                @click="garderMaPlace"
              >
                Non, garder ma place
              </button>
            </div>
          </div>
          <template v-else>
            <p>Vous pouvez vous désinscrire jusqu'au début de la sortie.</p>
            <button ref="boutonDesinscription" type="button" class="bouton bouton--secondaire" @click="demanderDesinscription">
              Me désinscrire
            </button>
          </template>
        </template>

        <button
          v-else-if="sortie.canRegister"
          type="button"
          class="bouton"
          :disabled="actionEnCours !== null"
          @click="sInscrire"
        >
          {{ actionEnCours === 'inscription' ? 'Inscription…' : 'M’inscrire à cette sortie' }}
        </button>

        <template v-else>
          <p>{{ sortie.registrationBlockedReason ?? 'L’inscription n’est pas possible pour le moment.' }}</p>
          <p v-if="!session.estApprouve">
            <RouterLink :to="{ name: 'mon-profil' }">Compléter ou vérifier mon profil</RouterLink>
          </p>
        </template>
      </section>
    </div>
  </article>
</template>
