<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { ApiError } from '../api/http';
import { fetchConversations, type ConversationSummary } from '../api/messagerie';
import { formaterMoment } from '../formats';
import { useSessionStore } from '../stores/session';

// Boîte de réception (mission 21) : GET /api/conversations, la plus récente d'abord.
// Ouverte à tout compte actif dont le profil n'est pas bloqué : un profil repassé en attente
// peut relire ses conversations (R-MSG-7), il ne peut simplement plus écrire.

const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'refus' | 'pret'>('chargement');
const erreur = ref('');
const conversations = ref<ConversationSummary[]>([]);
const titreListe = ref<HTMLElement | null>(null);
// Annonce lue après « Actualiser », pour dire que la liste a bien été relue.
const annonce = ref('');

// Aperçu d'une ligne : le texte est déjà nettoyé par l'API ; on le coupe pour la carte.
const APERCU_MAX = 120;
function apercu(texte: string): string {
  const caracteres = Array.from(texte);
  return caracteres.length > APERCU_MAX ? `${caracteres.slice(0, APERCU_MAX).join('').trimEnd()}…` : texte;
}

async function charger(): Promise<boolean> {
  if (session.estSuspendu || session.utilisateur?.profileStatus === 'blocked') {
    etat.value = 'refus';
    return false;
  }
  erreur.value = '';
  try {
    conversations.value = await fetchConversations();
    etat.value = 'pret';
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'PROFILE_BLOCKED' || e.code === 'ACCOUNT_SUSPENDED')) {
      erreur.value = e.message;
      etat.value = 'refus';
      return false;
    }
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
    return false;
  }
}

async function premierChargement(): Promise<void> {
  etat.value = 'chargement';
  await charger();
}

// « Actualiser » : la liste reste affichée pendant la relecture, puis on annonce le résultat.
const actualisation = ref(false);
async function actualiser(): Promise<void> {
  if (actualisation.value) return;
  actualisation.value = true;
  annonce.value = '';
  const ok = await charger();
  actualisation.value = false;
  if (ok) {
    annonce.value = 'Liste des conversations à jour.';
    await nextTick();
    titreListe.value?.focus();
  }
}

onMounted(premierChargement);
</script>

<template>
  <h2 class="titre-orne">Mes messages</h2>

  <section v-if="etat === 'refus'" class="message message--info" aria-labelledby="titre-messages-refus">
    <h3 id="titre-messages-refus">Messagerie non disponible</h3>
    <p>{{ erreur || 'Votre compte ou votre profil ne permet plus d’utiliser la messagerie.' }}</p>
    <p><RouterLink :to="{ name: 'mon-profil' }">Voir mon profil</RouterLink></p>
  </section>

  <template v-else>
    <p>
      Vos conversations avec les membres rencontrés lors d'une sortie. Pour écrire à quelqu'un, ouvrez sa fiche et
      choisissez « Écrire un message ».
    </p>
    <p v-if="!session.estApprouve" class="message message--info">
      Votre profil n'est pas approuvé : vous pouvez relire vos conversations, mais pas écrire.
      <RouterLink :to="{ name: 'mon-profil' }">Vérifier mon profil</RouterLink>.
    </p>

    <p v-if="etat === 'chargement'" class="message" role="status">Chargement de vos conversations…</p>

    <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
      <p>Vos conversations n'ont pas pu être chargées. {{ erreur }}</p>
      <button type="button" class="bouton" @click="premierChargement">Réessayer</button>
    </div>

    <section v-else class="boite-reception" aria-labelledby="titre-conversations">
      <div class="boite-reception__entete">
        <h3 id="titre-conversations" ref="titreListe" tabindex="-1">
          Conversations ({{ conversations.length }})
        </h3>
        <button type="button" class="bouton bouton--secondaire" :disabled="actualisation" @click="actualiser">
          {{ actualisation ? 'Actualisation…' : 'Actualiser' }}
        </button>
      </div>
      <p class="visuellement-cache" role="status">{{ annonce }}</p>

      <p v-if="conversations.length === 0" class="message">
        Vous n'avez encore aucune conversation. Après une sortie, retrouvez les autres participants dans la liste des
        membres pour leur écrire.
      </p>

      <ul v-else class="liste-conversations">
        <li v-for="c in conversations" :key="c.id" class="carte carte-conversation">
          <h4 class="carte-conversation__nom">
            <RouterLink :to="{ name: 'conversation', params: { conversationId: c.id } }">
              {{ c.otherParticipant.displayName }}
            </RouterLink>
          </h4>
          <p v-if="c.contextEvent" class="carte-conversation__contexte">Rencontre : {{ c.contextEvent.title }}</p>
          <!-- Texte brut : l'interpolation de Vue l'échappe, aucun HTML n'est interprété (R-MSG-6). -->
          <p v-if="c.lastMessage" class="carte-conversation__apercu">
            <strong>{{ c.lastMessage.sentByMe ? 'Vous' : c.otherParticipant.displayName }} :</strong>
            {{ apercu(c.lastMessage.body) }}
          </p>
          <p v-else class="carte-conversation__apercu">Aucun message pour l'instant.</p>
          <p class="carte-conversation__date">
            <time :datetime="c.lastMessage?.createdAt ?? c.createdAt">
              {{ formaterMoment(c.lastMessage?.createdAt ?? c.createdAt) }}
            </time>
            <template v-if="!c.canSend"> · Lecture seule</template>
          </p>
        </li>
      </ul>
    </section>
  </template>
</template>
