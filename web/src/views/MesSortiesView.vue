<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ApiError } from '../api/http';
import { fetchMesSorties, type EventSummary } from '../api/sorties';
import CarteSortie from '../components/CarteSortie.vue';
import { useSessionStore } from '../stores/session';

// « Mes sorties » (mission 17) : GET /api/me/organized-events, toutes les sorties de
// l'organisateur connecté, brouillons compris. C'est le seul moyen de retrouver un brouillon,
// une sortie annulée ou terminée : la liste publique ne montre que le publié et à venir.

const session = useSessionStore();

const etat = ref<'chargement' | 'erreur' | 'refus' | 'pret'>('chargement');
const erreur = ref('');
const sorties = ref<EventSummary[]>([]);

type Groupe = { id: string; titre: string; aide: string; sorties: EventSummary[] };

const parDate = (sens: 1 | -1) => (a: EventSummary, b: EventSummary) =>
  sens * (new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

// Ce qui demande une action d'abord ; dans chaque groupe, l'ordre le plus utile.
const groupes = computed<Groupe[]>(() => {
  const liste = sorties.value;
  const publiees = liste.filter((s) => s.status === 'published');
  return [
    {
      id: 'brouillons',
      titre: 'Brouillons',
      aide: 'Visibles par vous seul. Publiez-les pour ouvrir les inscriptions.',
      sorties: liste.filter((s) => s.status === 'draft').sort(parDate(1)),
    },
    {
      id: 'a-venir',
      titre: 'À venir',
      aide: 'Publiées : les membres peuvent les voir et s’y inscrire.',
      sorties: publiees.filter((s) => !s.isPast).sort(parDate(1)),
    },
    {
      id: 'a-cloturer',
      titre: 'Passées, à clôturer',
      aide: 'Une fois la sortie finie, clôturez-la depuis sa fiche.',
      sorties: publiees.filter((s) => s.isPast).sort(parDate(-1)),
    },
    {
      id: 'terminees',
      titre: 'Terminées',
      aide: 'Clôturées : elles restent consultables par leurs participants.',
      sorties: liste.filter((s) => s.status === 'completed').sort(parDate(-1)),
    },
    {
      id: 'annulees',
      titre: 'Annulées',
      aide: 'Les personnes inscrites voient le motif sur la fiche.',
      sorties: liste.filter((s) => s.status === 'cancelled').sort(parDate(-1)),
    },
  ].filter((g) => g.sorties.length > 0);
});

// Le détail par statut est donné par les titres de groupe, qui portent chacun leur nombre.
const resume = computed(() => {
  const total = sorties.value.length;
  return total > 1 ? `Vous organisez ${total} sorties.` : 'Vous organisez 1 sortie.';
});

async function charger(): Promise<void> {
  // L'API exige le rôle d'organisateur et un profil approuvé : on l'explique sans l'appeler.
  if (!session.estOrganisateur || !session.estApprouve) {
    etat.value = 'refus';
    return;
  }
  etat.value = 'chargement';
  erreur.value = '';
  try {
    sorties.value = await fetchMesSorties();
    etat.value = 'pret';
  } catch (e) {
    // Rôle retiré, profil bloqué ou repassé en attente depuis la connexion : message de l'API.
    if (
      e instanceof ApiError &&
      ['ROLE_REQUIRED', 'PROFILE_NOT_APPROVED', 'PROFILE_BLOCKED', 'ACCOUNT_SUSPENDED'].includes(e.code)
    ) {
      erreur.value = e.message;
      etat.value = 'refus';
      return;
    }
    erreur.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(charger);
</script>

<template>
  <h2 class="titre-orne">Mes sorties</h2>

  <section v-if="etat === 'refus'" class="message message--info" aria-labelledby="titre-mes-sorties-refus">
    <h3 id="titre-mes-sorties-refus">Réservé aux organisateurs</h3>
    <p v-if="erreur">{{ erreur }}</p>
    <template v-else-if="session.estOrganisateur">
      <p>Votre profil doit être approuvé par un modérateur pour organiser des sorties.</p>
      <p><RouterLink :to="{ name: 'mon-profil' }">Vérifier mon profil</RouterLink></p>
    </template>
    <template v-else>
      <p>Cette page rassemble les sorties que vous organisez. Le rôle d'organisateur est attribué par un modérateur.</p>
      <p><RouterLink :to="{ name: 'sorties' }">Voir les sorties à venir</RouterLink></p>
    </template>
  </section>

  <template v-else>
    <p>Retrouvez toutes les sorties que vous organisez, y compris vos brouillons. Ouvrez-en une pour la gérer.</p>
    <p><RouterLink class="bouton" :to="{ name: 'nouvelle-sortie' }">Créer une sortie</RouterLink></p>

    <p v-if="etat === 'chargement'" class="message" role="status">Chargement de vos sorties…</p>

    <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
      <p>Vos sorties n'ont pas pu être chargées. {{ erreur }}</p>
      <button type="button" class="bouton" @click="charger">Réessayer</button>
    </div>

    <p v-else-if="sorties.length === 0" class="message" role="status">Vous n'organisez encore aucune sortie.</p>

    <template v-else>
      <p class="resultats__resume" role="status">{{ resume }}</p>

      <!-- Un titre par groupe : la navigation par titres permet d'aller droit aux brouillons. -->
      <section
        v-for="groupe in groupes"
        :key="groupe.id"
        class="groupe-sorties"
        :aria-labelledby="`groupe-${groupe.id}`"
      >
        <h3 :id="`groupe-${groupe.id}`">{{ groupe.titre }} ({{ groupe.sorties.length }})</h3>
        <p class="champ__aide">{{ groupe.aide }}</p>
        <ul class="liste-sorties">
          <CarteSortie
            v-for="sortie in groupe.sorties"
            :key="sortie.id"
            :sortie="sortie"
            :lien="{ name: 'sortie', params: { eventId: sortie.id }, query: { depuis: 'mes-sorties' } }"
            pour-organisateur
          />
        </ul>
      </section>
    </template>
  </template>
</template>
