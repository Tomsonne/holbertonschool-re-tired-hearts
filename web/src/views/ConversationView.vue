<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../api/http';
import {
  envoyerMessage,
  fetchConversation,
  fetchMessages,
  TAILLE_PAGE_MESSAGES,
  type Conversation,
  type Message,
  type RaisonEnvoiImpossible,
} from '../api/messagerie';
import { formaterMoment, longueurMessage, MESSAGE_MAX, RAISONS_ENVOI_IMPOSSIBLE } from '../formats';
import { useSessionStore } from '../stores/session';

// Conversation (mission 21) : GET /api/conversations/:id et ses messages, envoi par
// POST /api/conversations/:id/messages. Messages du plus ancien au plus récent, expéditeur
// identifié, texte affiché par interpolation uniquement (R-MSG-6, jamais v-html).

const route = useRoute();
const session = useSessionStore();
const identifiant = () => String(route.params.conversationId);

const etat = ref<'chargement' | 'erreur' | 'indisponible' | 'refus' | 'pret'>('chargement');
const erreur = ref('');
const conversation = ref<Conversation | null>(null);
const messages = ref<Message[]>([]);
// Une page pleine laisse supposer des messages plus anciens.
const plusAnciens = ref(false);
const chargementAnciens = ref(false);
const erreurAnciens = ref('');

const texte = ref('');
const erreurEnvoi = ref<string | null>(null);
const envoiEnCours = ref(false);
const annonce = ref('');
const actualisation = ref(false);

const champMessage = ref<HTMLTextAreaElement | null>(null);
const zoneEnvoiImpossible = ref<HTMLElement | null>(null);
const titreMessages = ref<HTMLElement | null>(null);

const longueur = computed(() => longueurMessage(texte.value));
const autre = computed(() => conversation.value?.otherParticipant ?? null);
const lienFiche = computed(() => !!autre.value?.available && session.estApprouve);
// Jamais vide : sans motif reconnu, une explication générale reste affichée.
const raisonEnvoiImpossible = computed(() => {
  const code = conversation.value?.cannotSendReason;
  return (code && RAISONS_ENVOI_IMPOSSIBLE[code]) || 'Vous ne pouvez pas écrire dans cette conversation pour le moment.';
});

// Une conversation demandée avant une autre ne doit pas l'écraser.
let derniereRequete = 0;

function gererRefus(e: unknown): boolean {
  if (e instanceof ApiError && e.status === 404) {
    etat.value = 'indisponible';
    return true;
  }
  if (e instanceof ApiError && (e.code === 'PROFILE_BLOCKED' || e.code === 'ACCOUNT_SUSPENDED')) {
    erreur.value = e.message;
    etat.value = 'refus';
    return true;
  }
  return false;
}

async function charger(): Promise<void> {
  const numero = ++derniereRequete;
  etat.value = 'chargement';
  erreur.value = '';
  try {
    const [c, liste] = await Promise.all([fetchConversation(identifiant()), fetchMessages(identifiant())]);
    if (numero !== derniereRequete) return;
    conversation.value = c;
    messages.value = liste;
    plusAnciens.value = liste.length === TAILLE_PAGE_MESSAGES;
    etat.value = 'pret';
    document.title = `Conversation avec ${c.otherParticipant.displayName} — Re-Tired Hearts`;
  } catch (e) {
    if (numero !== derniereRequete) return;
    if (gererRefus(e)) return;
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(charger);
watch(() => route.params.conversationId, (id) => id && charger());

// Messages plus anciens : ajoutés en haut, puis le focus va sur le premier d'entre eux.
async function chargerAnciens(): Promise<void> {
  const premier = messages.value[0];
  if (!premier || chargementAnciens.value) return;
  chargementAnciens.value = true;
  erreurAnciens.value = '';
  try {
    const anciens = await fetchMessages(identifiant(), premier.id);
    messages.value = [...anciens, ...messages.value];
    plusAnciens.value = anciens.length === TAILLE_PAGE_MESSAGES;
    await nextTick();
    if (anciens.length) document.getElementById(`message-${anciens[0].id}`)?.focus();
  } catch (e) {
    erreurAnciens.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
  } finally {
    chargementAnciens.value = false;
  }
}

// « Actualiser » : relit la conversation et les derniers messages, et dit ce qui a changé.
async function actualiser(): Promise<void> {
  if (actualisation.value) return;
  actualisation.value = true;
  annonce.value = '';
  try {
    const [c, recents] = await Promise.all([fetchConversation(identifiant()), fetchMessages(identifiant())]);
    const connus = new Set(messages.value.map((m) => m.id));
    const nouveaux = recents.filter((m) => !connus.has(m.id)).length;
    const idsRecents = new Set(recents.map((m) => m.id));
    // Si les deux listes se recouvrent, on garde les plus anciens déjà chargés ; sinon (plus de
    // 50 nouveaux messages), on repart des derniers.
    const recouvrement = recents.some((m) => connus.has(m.id));
    messages.value = recouvrement || messages.value.length === 0
      ? [...messages.value.filter((m) => !idsRecents.has(m.id)), ...recents]
      : recents;
    if (!recouvrement) plusAnciens.value = recents.length === TAILLE_PAGE_MESSAGES;
    conversation.value = c;
    annonce.value =
      nouveaux === 0 ? 'Aucun nouveau message.' : nouveaux === 1 ? '1 nouveau message.' : `${nouveaux} nouveaux messages.`;
    await nextTick();
    titreMessages.value?.focus();
  } catch (e) {
    if (!gererRefus(e)) {
      annonce.value = `La conversation n'a pas pu être actualisée. ${e instanceof ApiError ? e.message : ''}`.trim();
    }
  } finally {
    actualisation.value = false;
  }
}

// Envoi impossible découvert à l'envoi : la fiche est relue, le formulaire laisse place à l'explication.
// Le motif renvoyé par l'API à l'envoi est conservé : si la relecture échoue, ou ne précise pas
// de motif, c'est lui qui est expliqué.
async function passerEnLectureSeule(motif: RaisonEnvoiImpossible): Promise<void> {
  try {
    const relue = await fetchConversation(identifiant());
    conversation.value = relue.canSend ? relue : { ...relue, cannotSendReason: relue.cannotSendReason ?? motif };
  } catch {
    if (conversation.value) conversation.value = { ...conversation.value, canSend: false, cannotSendReason: motif };
  }
  await nextTick();
  zoneEnvoiImpossible.value?.focus();
}

async function envoyer(): Promise<void> {
  if (envoiEnCours.value || !conversation.value) return;
  erreurEnvoi.value = null;
  annonce.value = '';
  if (longueur.value < 1) {
    erreurEnvoi.value = 'Écrivez votre message avant de l’envoyer.';
    champMessage.value?.focus();
    return;
  }
  if (longueur.value > MESSAGE_MAX) {
    erreurEnvoi.value = `Votre message est trop long : ${MESSAGE_MAX} caractères au maximum.`;
    champMessage.value?.focus();
    return;
  }
  envoiEnCours.value = true;
  try {
    const envoye = await envoyerMessage(conversation.value.id, texte.value);
    messages.value = [...messages.value, envoye];
    texte.value = '';
    annonce.value = 'Message envoyé.';
    // Le focus reste dans le champ : on peut écrire le message suivant.
    champMessage.value?.focus();
  } catch (e) {
    if (e instanceof ApiError && ['RECIPIENT_UNAVAILABLE', 'MESSAGING_DISABLED', 'PROFILE_NOT_APPROVED'].includes(e.code)) {
      // Le texte saisi reste dans le champ, même s'il n'est plus affiché : rien n'est perdu au rechargement.
      if (e.code === 'PROFILE_NOT_APPROVED') {
        const u = session.utilisateur;
        if (u) session.synchroniserProfil({ displayName: u.displayName, status: 'pending' });
      }
      await passerEnLectureSeule(e.code as RaisonEnvoiImpossible);
      return;
    }
    if (gererRefus(e)) return;
    erreurEnvoi.value =
      e instanceof ApiError && e.status === 429
        ? 'Vous avez envoyé beaucoup de messages en peu de temps. Patientez quelques minutes, puis réessayez.'
        : e instanceof ApiError
          ? e.message
          : 'Le message n’a pas pu être envoyé. Vérifiez votre connexion internet, puis réessayez.';
    champMessage.value?.focus();
  } finally {
    envoiEnCours.value = false;
  }
}
</script>

<template>
  <p class="lien-retour"><RouterLink :to="{ name: 'messages' }">← Retour à mes messages</RouterLink></p>

  <section v-if="etat === 'refus'" class="message message--info" aria-labelledby="titre-conversation-refus">
    <h2 id="titre-conversation-refus">Messagerie non disponible</h2>
    <p>{{ erreur }}</p>
  </section>

  <p v-else-if="etat === 'chargement'" class="message" role="status">Chargement de la conversation…</p>

  <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
    <p>La conversation n'a pas pu être chargée. {{ erreur }}</p>
    <button type="button" class="bouton" @click="charger">Réessayer</button>
  </div>

  <section v-else-if="etat === 'indisponible'" class="message" aria-labelledby="titre-conversation-indisponible">
    <h2 id="titre-conversation-indisponible">Conversation indisponible</h2>
    <p>Cette conversation n'existe pas ou ne vous concerne pas.</p>
    <p><RouterLink :to="{ name: 'messages' }">Voir mes messages</RouterLink></p>
  </section>

  <article v-else-if="conversation && autre" class="conversation" aria-labelledby="titre-conversation">
    <h2 id="titre-conversation" class="conversation__titre">
      Conversation avec
      <RouterLink v-if="lienFiche" :to="{ name: 'membre', params: { userId: autre.userId } }">{{ autre.displayName }}</RouterLink>
      <template v-else>{{ autre.displayName }}</template>
    </h2>
    <p v-if="conversation.contextEvent" class="conversation__contexte">
      Rencontre lors de la sortie
      <RouterLink :to="{ name: 'sortie', params: { eventId: conversation.contextEvent.id } }">
        « {{ conversation.contextEvent.title }} »
      </RouterLink>
    </p>

    <section class="carte conversation__fil" aria-labelledby="titre-messages">
      <div class="conversation__entete">
        <h3 id="titre-messages" ref="titreMessages" tabindex="-1">Messages</h3>
        <button type="button" class="bouton bouton--secondaire" :disabled="actualisation" @click="actualiser">
          {{ actualisation ? 'Actualisation…' : 'Actualiser' }}
        </button>
      </div>

      <div v-if="plusAnciens" class="conversation__anciens">
        <button type="button" class="bouton bouton--secondaire" :disabled="chargementAnciens" @click="chargerAnciens">
          {{ chargementAnciens ? 'Chargement…' : 'Voir les messages plus anciens' }}
        </button>
        <p v-if="erreurAnciens" class="champ__erreur" role="alert">
          Les messages plus anciens n'ont pas pu être chargés. {{ erreurAnciens }}
        </p>
      </div>

      <p v-if="messages.length === 0" class="message">
        Aucun message pour l'instant.
        <template v-if="conversation.canSend"> Écrivez le premier ci-dessous.</template>
      </p>

      <ol v-else class="liste-messages">
        <li
          v-for="m in messages"
          :id="`message-${m.id}`"
          :key="m.id"
          class="bulle"
          :class="{ 'bulle--moi': m.sentByMe }"
          tabindex="-1"
        >
          <p class="bulle__entete">
            <strong>{{ m.sentByMe ? 'Vous' : m.senderDisplayName }}</strong>
            <time :datetime="m.createdAt">{{ formaterMoment(m.createdAt) }}</time>
          </p>
          <!-- Texte brut : l'interpolation de Vue l'échappe, aucun HTML n'est interprété (R-MSG-6). -->
          <p class="bulle__texte">{{ m.body }}</p>
        </li>
      </ol>
    </section>

    <!-- Annonces des actions (envoi, actualisation), lues sans déplacer le focus. -->
    <p class="visuellement-cache" role="status">{{ annonce }}</p>

    <form v-if="conversation.canSend" class="carte conversation__envoi" novalidate @submit.prevent="envoyer">
      <div class="champ">
        <label for="nouveau-message">Votre message à {{ autre.displayName }}</label>
        <p id="nouveau-message-aide" class="champ__aide">
          {{ MESSAGE_MAX }} caractères au maximum. Les retours à la ligne ne sont pas conservés.
        </p>
        <textarea
          id="nouveau-message"
          ref="champMessage"
          v-model="texte"
          name="body"
          rows="4"
          :aria-invalid="erreurEnvoi ? 'true' : undefined"
          :aria-describedby="
            erreurEnvoi ? 'nouveau-message-aide nouveau-message-compteur nouveau-message-erreur' : 'nouveau-message-aide nouveau-message-compteur'
          "
        />
        <p id="nouveau-message-compteur" class="compteur" :class="{ 'compteur--depasse': longueur > MESSAGE_MAX }">
          {{ longueur }} / {{ MESSAGE_MAX }} caractères
        </p>
        <p v-if="erreurEnvoi" id="nouveau-message-erreur" class="champ__erreur" role="alert">{{ erreurEnvoi }}</p>
      </div>
      <button type="submit" class="bouton" :disabled="envoiEnCours">
        {{ envoiEnCours ? 'Envoi…' : 'Envoyer le message' }}
      </button>
    </form>

    <section
      v-else
      ref="zoneEnvoiImpossible"
      class="message message--info conversation__lecture-seule"
      tabindex="-1"
      aria-labelledby="titre-lecture-seule"
    >
      <h3 id="titre-lecture-seule">Envoi impossible</h3>
      <p>{{ raisonEnvoiImpossible }}</p>
      <p v-if="conversation.cannotSendReason !== 'RECIPIENT_UNAVAILABLE'">
        <RouterLink :to="{ name: 'mon-profil' }">Voir mon profil</RouterLink>
      </p>
    </section>
  </article>
</template>
