<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/http';
import { fetchInterests, type Interest } from '../api/interests';
import {
  creerSortie,
  fetchEvent,
  modifierSortie,
  type EventDetail,
  type EventInput,
  type EventLocationInput,
} from '../api/sorties';
import { useRechercheCommune } from '../composables/rechercheCommune';
import { DEPARTEMENT_VALIDE, formaterLocalisation, isoDepuisParis, partiesParis } from '../formats';
import { useSessionStore } from '../stores/session';

// Créer ou modifier une sortie (mission 17) : POST /api/events (brouillon) et PATCH /api/events/:id.
// Règles : R-EVT-2 à R-EVT-5, R-LOC-3 et R-LOC-4. L'API refait tous les contrôles ; ses refus sont
// rangés sous le bon champ quand c'est possible, sinon affichés tels quels en tête du formulaire.

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const enModification = computed(() => route.name === 'modifier-sortie');
const identifiant = () => String(route.params.eventId);

type Champ =
  | 'titre' | 'description' | 'interet' | 'date' | 'heureDebut' | 'heureFin'
  | 'ville' | 'codePostal' | 'departement' | 'repere' | 'adresse' | 'capacite';

const LIBELLES: Record<Champ, string> = {
  titre: 'Titre',
  description: 'Description',
  interet: "Centre d'intérêt",
  date: 'Date',
  heureDebut: 'Heure de début',
  heureFin: 'Heure de fin',
  ville: 'Ville',
  codePostal: 'Code postal',
  departement: 'Département',
  repere: 'Repère visible par tous',
  adresse: 'Adresse exacte',
  capacite: 'Nombre de places',
};
const IDS: Record<Champ, string> = {
  titre: 'sortie-titre',
  description: 'sortie-description',
  interet: 'sortie-interet',
  date: 'sortie-date',
  heureDebut: 'sortie-heure-debut',
  heureFin: 'sortie-heure-fin',
  ville: 'sortie-ville',
  codePostal: 'sortie-code-postal',
  departement: 'sortie-departement',
  repere: 'sortie-repere',
  adresse: 'sortie-adresse',
  capacite: 'sortie-capacite',
};
// Nom des champs côté API (details[].field) → nos champs.
const CHAMPS_API: Record<string, Champ> = {
  title: 'titre',
  description: 'description',
  interestId: 'interet',
  startsAt: 'heureDebut',
  endsAt: 'heureFin',
  location: 'ville',
  'location.cityName': 'ville',
  'location.postalCode': 'codePostal',
  'location.departmentCode': 'departement',
  areaHint: 'repere',
  exactAddress: 'adresse',
  capacity: 'capacite',
};
const ORDRE: Champ[] = Object.keys(LIBELLES) as Champ[];
const LIMITES = { titre: [5, 120], description: [20, 2000], repere: 120, adresse: 200, capacite: [1, 50] } as const;

const etat = ref<'chargement' | 'erreur' | 'refus' | 'pret'>('chargement');
const erreurChargement = ref('');
const motifRefus = ref('');
const sortie = ref<EventDetail | null>(null);
const interets = ref<Interest[]>([]);

const form = reactive({
  titre: '',
  description: '',
  interet: '',
  date: '',
  heureDebut: '',
  heureFin: '',
  ville: '',
  codePostal: '',
  departement: '',
  repere: '',
  adresse: '',
  capacite: '10',
});
// Valeurs de départ, pour n'envoyer que ce qui a changé lors d'une modification.
let initial: typeof form = { ...form };

const erreursChamps = reactive<Partial<Record<Champ, string>>>({});
const erreurGenerale = ref<string | null>(null);
const envoiEnCours = ref(false);
const resumeErreurs = ref<HTMLElement | null>(null);

const commune = useRechercheCommune(form);
const { suggestions, rechercheManuelle, rechercheEnCours } = commune;

// Modification : le lieu actuel est affiché, et ne change que si l'organisateur le demande
// (EventDetail ne renvoie pas le code postal, que l'API exige pour un nouveau lieu).
const changerLieu = ref(false);
const saisieLieu = computed(() => !enModification.value || changerLieu.value);

// R-EVT-5 : après une inscription, date, lieu et centre d'intérêt sont figés.
const inscrits = computed(() => (sortie.value ? sortie.value.capacity - sortie.value.availablePlaces : 0));
const figee = computed(() => sortie.value?.status === 'published' && inscrits.value > 0);
const capaciteMin = computed(() => Math.max(LIMITES.capacite[0], inscrits.value));

const listeErreurs = computed(() =>
  ORDRE.filter((c) => erreursChamps[c]).map((c) => ({ champ: c, message: erreursChamps[c]! })),
);
const aDesErreurs = computed(() => listeErreurs.value.length > 0 || erreurGenerale.value !== null);
const longueurDescription = computed(() => form.description.trim().length);

function descriptionChamp(champ: Champ, aide?: string): string | undefined {
  const ids = [aide, erreursChamps[champ] ? `${IDS[champ]}-erreur` : undefined].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function remplir(s: EventDetail): void {
  const debut = partiesParis(s.startsAt);
  const fin = partiesParis(s.endsAt);
  Object.assign(form, {
    titre: s.title,
    description: s.description,
    interet: String(s.interest.id),
    date: debut?.date ?? '',
    heureDebut: debut?.heure ?? '',
    heureFin: fin?.heure ?? '',
    ville: '',
    codePostal: '',
    departement: '',
    repere: s.areaHint ?? '',
    adresse: s.exactAddress ?? '',
    capacite: String(s.capacity),
  });
  initial = { ...form };
  commune.reinitialiser();
  changerLieu.value = false;
}

async function charger(): Promise<void> {
  // L'API exige le rôle d'organisateur et un profil approuvé (R-EVT-2) : on l'explique sans l'appeler.
  if (!session.estOrganisateur || !session.estApprouve) {
    motifRefus.value = session.estOrganisateur
      ? 'Votre profil doit être approuvé par un modérateur pour organiser des sorties.'
      : "Seuls les organisateurs peuvent créer des sorties. Ce rôle est attribué par un modérateur.";
    etat.value = 'refus';
    return;
  }
  etat.value = 'chargement';
  erreurChargement.value = '';
  try {
    const [liste, detail] = await Promise.all([
      fetchInterests(),
      enModification.value ? fetchEvent(identifiant()) : Promise.resolve(null),
    ]);
    interets.value = liste;
    if (detail) {
      sortie.value = detail;
      if (!detail.isOrganizer) {
        motifRefus.value = 'Vous ne pouvez modifier que les sorties que vous organisez.';
        etat.value = 'refus';
        return;
      }
      const modifiable = detail.status === 'draft' || (detail.status === 'published' && !detail.isPast);
      if (!modifiable) {
        motifRefus.value = 'Cette sortie ne peut plus être modifiée : elle est commencée, terminée ou annulée.';
        etat.value = 'refus';
        return;
      }
      remplir(detail);
      document.title = `Modifier « ${detail.title} » — Re-Tired Hearts`;
    }
    etat.value = 'pret';
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      motifRefus.value = "Cette sortie n'est pas disponible.";
      etat.value = 'refus';
      return;
    }
    erreurChargement.value = e instanceof ApiError ? e.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(charger);

function viderErreurs(): void {
  ORDRE.forEach((c) => delete erreursChamps[c]);
  erreurGenerale.value = null;
}

// Mêmes règles que l'API (EventInputDto), avec des messages en français simple.
function valider(): { debut: string | null; fin: string | null } {
  const titre = form.titre.trim();
  if (titre.length < LIMITES.titre[0] || titre.length > LIMITES.titre[1])
    erreursChamps.titre = `Entre ${LIMITES.titre[0]} et ${LIMITES.titre[1]} caractères.`;
  const description = form.description.trim();
  if (description.length < LIMITES.description[0] || description.length > LIMITES.description[1])
    erreursChamps.description = `Entre ${LIMITES.description[0]} et ${LIMITES.description[1]} caractères.`;
  if (!form.interet) erreursChamps.interet = "Choisissez le thème principal de la sortie.";

  let debut: string | null = null;
  let fin: string | null = null;
  if (!figee.value) {
    if (!form.date) erreursChamps.date = 'Indiquez le jour de la sortie.';
    if (!form.heureDebut) erreursChamps.heureDebut = 'Indiquez l’heure de début, par exemple 14:30.';
    if (!form.heureFin) erreursChamps.heureFin = 'Indiquez l’heure de fin, par exemple 17:00.';
    if (form.date && form.heureDebut && form.heureFin) {
      debut = isoDepuisParis(form.date, form.heureDebut);
      fin = isoDepuisParis(form.date, form.heureFin);
      if (!debut) erreursChamps.heureDebut = "Cette date ou cette heure n'existe pas.";
      else if (new Date(debut).getTime() <= Date.now()) erreursChamps.date = 'La sortie doit avoir lieu dans le futur.';
      if (!fin) erreursChamps.heureFin = "Cette heure n'existe pas.";
      else if (debut && fin <= debut) erreursChamps.heureFin = "L'heure de fin doit être après l'heure de début.";
    }

    if (saisieLieu.value) {
      const ville = form.ville.trim();
      if (!ville) erreursChamps.ville = 'Indiquez la ville du rendez-vous.';
      else if (ville.length > 100) erreursChamps.ville = 'Le nom de la ville ne doit pas dépasser 100 caractères.';
      if (!/^[0-9]{5}$/.test(form.codePostal.trim()))
        erreursChamps.codePostal = 'Saisissez les 5 chiffres du code postal, par exemple 31000.';
      if (!DEPARTEMENT_VALIDE.test(form.departement.trim().toUpperCase()))
        erreursChamps.departement = 'Saisissez le numéro du département, par exemple 31, 2A ou 974.';
    }
    if (form.repere.trim().length > LIMITES.repere)
      erreursChamps.repere = `${LIMITES.repere} caractères au maximum.`;
    const adresse = form.adresse.trim();
    if (!adresse) erreursChamps.adresse = 'Indiquez l’adresse du rendez-vous : seuls les inscrits la verront.';
    else if (adresse.length > LIMITES.adresse) erreursChamps.adresse = `${LIMITES.adresse} caractères au maximum.`;
  }

  const capacite = Number(form.capacite);
  if (!Number.isInteger(capacite) || capacite < capaciteMin.value || capacite > LIMITES.capacite[1]) {
    erreursChamps.capacite =
      inscrits.value > LIMITES.capacite[0]
        ? `Entre ${capaciteMin.value} (personnes déjà inscrites) et ${LIMITES.capacite[1]}.`
        : `Un nombre entier entre ${LIMITES.capacite[0]} et ${LIMITES.capacite[1]}.`;
  }
  return { debut, fin };
}

function lieuSaisi(): EventLocationInput {
  const choisie = commune.communeValide();
  return {
    cityName: form.ville.trim(),
    postalCode: form.codePostal.trim(),
    departmentCode: form.departement.trim().toUpperCase(),
    // Commune choisie dans la recherche : code INSEE et lieu vérifié. Sinon saisie manuelle (R-LOC-3).
    cityCode: choisie ? choisie.cityCode : null,
    verified: choisie !== null,
  };
}

function donneesCompletes(debut: string, fin: string): EventInput {
  return {
    title: form.titre.trim(),
    description: form.description.trim(),
    interestId: Number(form.interet),
    startsAt: debut,
    endsAt: fin,
    location: lieuSaisi(),
    areaHint: form.repere.trim() || null,
    exactAddress: form.adresse.trim(),
    capacity: Number(form.capacite),
  };
}

// Modification : seuls les champs changés partent. Renvoyer une date inchangée pourrait la
// décaler de quelques secondes et déclencher à tort EVENT_HAS_REGISTRATIONS.
function changements(debut: string | null, fin: string | null): Partial<EventInput> {
  const c: Partial<EventInput> = {};
  // String() : Vue convertit en nombre la valeur d'un <input type="number"> (le nombre de places).
  const change = (cle: keyof typeof form) => String(form[cle]).trim() !== String(initial[cle]).trim();
  if (change('titre')) c.title = form.titre.trim();
  if (change('description')) c.description = form.description.trim();
  if (change('capacite')) c.capacity = Number(form.capacite);
  if (figee.value) return c;
  if (change('interet')) c.interestId = Number(form.interet);
  if ((change('date') || change('heureDebut')) && debut) c.startsAt = debut;
  if ((change('date') || change('heureFin')) && fin) c.endsAt = fin;
  if (change('repere')) c.areaHint = form.repere.trim() || null;
  if (change('adresse')) c.exactAddress = form.adresse.trim();
  if (changerLieu.value) c.location = lieuSaisi();
  return c;
}

function traiterErreur(e: unknown): void {
  if (!(e instanceof ApiError)) {
    erreurGenerale.value = 'Une erreur est survenue. Merci de réessayer.';
    return;
  }
  // Critère de la mission : les erreurs de l'API sont affichées telles quelles. Son message
  // général va en tête du résumé ; chaque détail reconnu est placé, mot pour mot, sous son champ.
  erreurGenerale.value = e.message;
  if (e.code === 'VALIDATION_FAILED' && e.details.length) {
    for (const detail of e.details) {
      const champ = CHAMPS_API[detail.field];
      if (!champ) continue;
      erreursChamps[champ] = [erreursChamps[champ], ...detail.messages].filter(Boolean).join(' ');
    }
    return;
  }
  // Le refus concerne le nombre de places : il est aussi rappelé sous ce champ.
  if (e.code === 'CAPACITY_BELOW_REGISTRATIONS') erreursChamps.capacite = e.message;
  // EVENT_HAS_REGISTRATIONS, EVENT_NOT_EDITABLE, EVENT_IN_PAST, ROLE_REQUIRED… : en tête, tel quel.
}

async function enregistrer(): Promise<void> {
  if (envoiEnCours.value) return;
  viderErreurs();
  const { debut, fin } = valider();
  if (!aDesErreurs.value) {
    envoiEnCours.value = true;
    try {
      let resultat: EventDetail;
      let annonce: string;
      if (enModification.value && sortie.value) {
        const c = changements(debut, fin);
        const rien = Object.keys(c).length === 0;
        resultat = rien ? sortie.value : await modifierSortie(sortie.value.id, c);
        annonce = rien ? 'Aucune modification à enregistrer.' : 'Vos modifications sont enregistrées.';
      } else {
        resultat = await creerSortie(donneesCompletes(debut!, fin!));
        annonce = `Le brouillon « ${resultat.title} » est enregistré. Publiez-le quand il est prêt.`;
      }
      // La fiche affiche le message de réussite et reçoit le focus (voir EventView).
      await router.push({
        name: 'sortie',
        params: { eventId: resultat.id },
        query: { depuis: 'mes-sorties' },
        state: { annonce },
      });
      return;
    } catch (e) {
      traiterErreur(e);
    } finally {
      envoiEnCours.value = false;
    }
  }
  await nextTick();
  resumeErreurs.value?.focus();
}

function allerAuChamp(champ: Champ): void {
  document.getElementById(IDS[champ])?.focus();
}

async function ouvrirChangementLieu(): Promise<void> {
  changerLieu.value = true;
  commune.reinitialiser();
  await nextTick();
  document.getElementById(IDS.ville)?.focus();
}

const retour = computed(() =>
  enModification.value && sortie.value
    ? { name: 'sortie', params: { eventId: sortie.value.id }, query: { depuis: 'mes-sorties' } }
    : { name: 'mes-sorties' },
);
</script>

<template>
  <p class="lien-retour">
    <RouterLink :to="retour">{{ enModification ? '← Retour à la sortie' : '← Retour à mes sorties' }}</RouterLink>
  </p>
  <h2 class="titre-orne">{{ enModification ? 'Modifier la sortie' : 'Créer une sortie' }}</h2>

  <section v-if="etat === 'refus'" class="message message--info" aria-labelledby="titre-formulaire-refus">
    <h3 id="titre-formulaire-refus">{{ enModification ? 'Modification impossible' : 'Création impossible' }}</h3>
    <p>{{ motifRefus }}</p>
    <p><RouterLink :to="{ name: 'mes-sorties' }">Voir mes sorties</RouterLink></p>
  </section>

  <p v-else-if="etat === 'chargement'" class="message" role="status">Chargement du formulaire…</p>

  <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
    <p>Le formulaire n'a pas pu être chargé. {{ erreurChargement }}</p>
    <button type="button" class="bouton" @click="charger">Réessayer</button>
  </div>

  <section v-else class="carte formulaire-sortie" aria-labelledby="titre-formulaire-sortie">
    <h3 id="titre-formulaire-sortie" class="visuellement-cache">
      {{ enModification ? `Modifier « ${sortie?.title} »` : 'Nouvelle sortie' }}
    </h3>
    <p v-if="!enModification">
      La sortie est d'abord enregistrée comme <strong>brouillon</strong>, visible par vous seul. Vous la publierez
      ensuite depuis sa fiche.
    </p>
    <p v-if="figee" class="message message--info">
      {{ inscrits }} personne{{ inscrits > 1 ? 's sont inscrites' : ' est inscrite' }} : la date, le lieu et le centre
      d'intérêt ne peuvent plus changer. Vous pouvez encore modifier le titre, la description et le nombre de places.
    </p>

    <div v-if="aDesErreurs" ref="resumeErreurs" class="message message--erreur resume-erreurs" role="alert" tabindex="-1">
      <p v-if="erreurGenerale" class="resume-erreurs__titre">{{ erreurGenerale }}</p>
      <template v-if="listeErreurs.length">
        <p class="resume-erreurs__titre">
          Le formulaire contient {{ listeErreurs.length > 1 ? `${listeErreurs.length} erreurs` : 'une erreur' }} :
        </p>
        <ul>
          <li v-for="item in listeErreurs" :key="item.champ">
            <a :href="`#${IDS[item.champ]}`" @click.prevent="allerAuChamp(item.champ)">
              {{ LIBELLES[item.champ] }} : {{ item.message }}
            </a>
          </li>
        </ul>
      </template>
    </div>

    <form novalidate @submit.prevent="enregistrer">
      <!-- ===== Présentation ===== -->
      <fieldset class="groupe">
        <legend>La sortie</legend>

        <div class="champ">
          <label :for="IDS.titre">{{ LIBELLES.titre }}</label>
          <p id="sortie-titre-aide" class="champ__aide">Court et parlant, par exemple « Balade au bord du canal ».</p>
          <input
            :id="IDS.titre"
            v-model="form.titre"
            type="text"
            name="title"
            :maxlength="LIMITES.titre[1]"
            :aria-invalid="erreursChamps.titre ? 'true' : undefined"
            :aria-describedby="descriptionChamp('titre', 'sortie-titre-aide')"
          />
          <p v-if="erreursChamps.titre" :id="`${IDS.titre}-erreur`" class="champ__erreur">{{ erreursChamps.titre }}</p>
        </div>

        <div class="champ">
          <label :for="IDS.description">{{ LIBELLES.description }}</label>
          <p id="sortie-description-aide" class="champ__aide">
            Ce que vous ferez, le rythme, ce qu'il faut prévoir. Au moins {{ LIMITES.description[0] }} caractères.
          </p>
          <textarea
            :id="IDS.description"
            v-model="form.description"
            name="description"
            rows="5"
            :maxlength="LIMITES.description[1]"
            :aria-invalid="erreursChamps.description ? 'true' : undefined"
            :aria-describedby="[descriptionChamp('description', 'sortie-description-aide'), 'sortie-description-compteur'].join(' ')"
          />
          <p id="sortie-description-compteur" class="compteur">
            {{ longueurDescription }} / {{ LIMITES.description[1] }} caractères
          </p>
          <p v-if="erreursChamps.description" :id="`${IDS.description}-erreur`" class="champ__erreur">
            {{ erreursChamps.description }}
          </p>
        </div>

        <div class="champ">
          <label :for="IDS.interet">{{ LIBELLES.interet }}</label>
          <p id="sortie-interet-aide" class="champ__aide">Il permet aux membres de trouver la sortie avec les filtres.</p>
          <select
            :id="IDS.interet"
            v-model="form.interet"
            name="interestId"
            :disabled="figee"
            :aria-invalid="erreursChamps.interet ? 'true' : undefined"
            :aria-describedby="descriptionChamp('interet', 'sortie-interet-aide')"
          >
            <option value="">Choisir un thème</option>
            <option v-for="i in interets" :key="i.id" :value="String(i.id)">{{ i.label }}</option>
          </select>
          <p v-if="erreursChamps.interet" :id="`${IDS.interet}-erreur`" class="champ__erreur">{{ erreursChamps.interet }}</p>
        </div>
      </fieldset>

      <!-- ===== Quand ===== -->
      <fieldset class="groupe">
        <legend>Quand</legend>
        <p id="sortie-quand-aide" class="champ__aide">Heure de Paris. La sortie commence et finit le même jour.</p>
        <div class="champ">
          <label :for="IDS.date">{{ LIBELLES.date }}</label>
          <input
            :id="IDS.date"
            v-model="form.date"
            type="date"
            name="date"
            :disabled="figee"
            :aria-invalid="erreursChamps.date ? 'true' : undefined"
            :aria-describedby="descriptionChamp('date', 'sortie-quand-aide')"
          />
          <p v-if="erreursChamps.date" :id="`${IDS.date}-erreur`" class="champ__erreur">{{ erreursChamps.date }}</p>
        </div>
        <div class="ligne-champs">
          <div class="champ">
            <label :for="IDS.heureDebut">{{ LIBELLES.heureDebut }}</label>
            <input
              :id="IDS.heureDebut"
              v-model="form.heureDebut"
              type="time"
              name="startTime"
              :disabled="figee"
              :aria-invalid="erreursChamps.heureDebut ? 'true' : undefined"
              :aria-describedby="descriptionChamp('heureDebut')"
            />
            <p v-if="erreursChamps.heureDebut" :id="`${IDS.heureDebut}-erreur`" class="champ__erreur">
              {{ erreursChamps.heureDebut }}
            </p>
          </div>
          <div class="champ">
            <label :for="IDS.heureFin">{{ LIBELLES.heureFin }}</label>
            <input
              :id="IDS.heureFin"
              v-model="form.heureFin"
              type="time"
              name="endTime"
              :disabled="figee"
              :aria-invalid="erreursChamps.heureFin ? 'true' : undefined"
              :aria-describedby="descriptionChamp('heureFin')"
            />
            <p v-if="erreursChamps.heureFin" :id="`${IDS.heureFin}-erreur`" class="champ__erreur">
              {{ erreursChamps.heureFin }}
            </p>
          </div>
        </div>
      </fieldset>

      <!-- ===== Où ===== -->
      <fieldset class="groupe">
        <legend>Où</legend>
        <p id="sortie-lieu-aide" class="champ__aide">
          Les membres voient seulement la ville, le département et le repère. L'adresse exacte n'est montrée qu'aux
          personnes inscrites.
        </p>

        <!-- Modification : le lieu actuel, changé seulement sur demande. -->
        <div v-if="!saisieLieu && sortie" class="champ">
          <p>
            Lieu actuel : <strong>{{ formaterLocalisation(sortie.location) }}</strong>
          </p>
          <button v-if="!figee" type="button" class="bouton bouton--secondaire" @click="ouvrirChangementLieu">
            Changer la ville
          </button>
        </div>

        <template v-else>
          <div class="champ">
            <label :for="IDS.ville">{{ LIBELLES.ville }}</label>
            <p id="sortie-ville-aide" class="champ__aide">Tapez les premières lettres, puis choisissez dans la liste.</p>
            <input
              :id="IDS.ville"
              v-model="form.ville"
              type="text"
              name="cityName"
              autocomplete="off"
              maxlength="100"
              :aria-invalid="erreursChamps.ville ? 'true' : undefined"
              :aria-describedby="descriptionChamp('ville', 'sortie-ville-aide')"
              @input="commune.saisirVille"
            />
            <p v-if="rechercheEnCours" class="champ__aide" role="status">Recherche de communes…</p>
            <ul v-if="suggestions.length && !rechercheManuelle" class="suggestions-communes" aria-label="Communes proposées">
              <li v-for="c in suggestions" :key="c.cityCode">
                <button type="button" class="bouton bouton--secondaire" @click="commune.choisirCommune(c)">
                  {{ c.cityName }} ({{ c.departmentCode }}) — {{ c.postalCodes.join(', ') }}
                </button>
              </li>
            </ul>
            <p v-if="rechercheManuelle" class="champ__aide" role="status">
              Recherche indisponible ou sans résultat : saisissez la ville, le code postal et le département.
            </p>
            <button v-else type="button" class="lien-bouton" @click="commune.passerEnManuel">
              Saisir la ville manuellement
            </button>
            <p v-if="erreursChamps.ville" :id="`${IDS.ville}-erreur`" class="champ__erreur">{{ erreursChamps.ville }}</p>
          </div>

          <div class="ligne-champs">
            <div class="champ">
              <label :for="IDS.codePostal">{{ LIBELLES.codePostal }}</label>
              <input
                :id="IDS.codePostal"
                v-model="form.codePostal"
                type="text"
                name="postalCode"
                inputmode="numeric"
                maxlength="5"
                :aria-invalid="erreursChamps.codePostal ? 'true' : undefined"
                :aria-describedby="descriptionChamp('codePostal')"
                @input="commune.saisirLocalisation"
              />
              <p v-if="erreursChamps.codePostal" :id="`${IDS.codePostal}-erreur`" class="champ__erreur">
                {{ erreursChamps.codePostal }}
              </p>
            </div>
            <div class="champ">
              <label :for="IDS.departement">{{ LIBELLES.departement }}</label>
              <input
                :id="IDS.departement"
                v-model="form.departement"
                type="text"
                name="departmentCode"
                maxlength="3"
                :aria-invalid="erreursChamps.departement ? 'true' : undefined"
                :aria-describedby="descriptionChamp('departement')"
                @input="commune.saisirLocalisation"
              />
              <p v-if="erreursChamps.departement" :id="`${IDS.departement}-erreur`" class="champ__erreur">
                {{ erreursChamps.departement }}
              </p>
            </div>
          </div>
        </template>

        <div class="champ">
          <label :for="IDS.repere">{{ LIBELLES.repere }} (facultatif)</label>
          <p id="sortie-repere-aide" class="champ__aide">Un point de rendez-vous approximatif, par exemple « Près du kiosque ».</p>
          <input
            :id="IDS.repere"
            v-model="form.repere"
            type="text"
            name="areaHint"
            :maxlength="LIMITES.repere"
            :disabled="figee"
            :aria-invalid="erreursChamps.repere ? 'true' : undefined"
            :aria-describedby="descriptionChamp('repere', 'sortie-repere-aide')"
          />
          <p v-if="erreursChamps.repere" :id="`${IDS.repere}-erreur`" class="champ__erreur">{{ erreursChamps.repere }}</p>
        </div>

        <div class="champ">
          <label :for="IDS.adresse">{{ LIBELLES.adresse }}</label>
          <p id="sortie-adresse-aide" class="champ__aide">Privée : seules les personnes inscrites la verront.</p>
          <input
            :id="IDS.adresse"
            v-model="form.adresse"
            type="text"
            name="exactAddress"
            :maxlength="LIMITES.adresse"
            :disabled="figee"
            :aria-invalid="erreursChamps.adresse ? 'true' : undefined"
            :aria-describedby="descriptionChamp('adresse', 'sortie-adresse-aide')"
          />
          <p v-if="erreursChamps.adresse" :id="`${IDS.adresse}-erreur`" class="champ__erreur">{{ erreursChamps.adresse }}</p>
        </div>
      </fieldset>

      <!-- ===== Places ===== -->
      <fieldset class="groupe">
        <legend>Places</legend>
        <div class="champ">
          <label :for="IDS.capacite">{{ LIBELLES.capacite }}</label>
          <p id="sortie-capacite-aide" class="champ__aide">
            Sans compter vous-même : entre {{ capaciteMin }} et {{ LIMITES.capacite[1] }}.
          </p>
          <input
            :id="IDS.capacite"
            v-model="form.capacite"
            type="number"
            name="capacity"
            inputmode="numeric"
            :min="capaciteMin"
            :max="LIMITES.capacite[1]"
            step="1"
            :aria-invalid="erreursChamps.capacite ? 'true' : undefined"
            :aria-describedby="descriptionChamp('capacite', 'sortie-capacite-aide')"
          />
          <p v-if="erreursChamps.capacite" :id="`${IDS.capacite}-erreur`" class="champ__erreur">
            {{ erreursChamps.capacite }}
          </p>
        </div>
      </fieldset>

      <div class="formulaire-sortie__actions">
        <button type="submit" class="bouton" :disabled="envoiEnCours">
          {{ envoiEnCours ? 'Enregistrement…' : enModification ? 'Enregistrer les modifications' : 'Enregistrer le brouillon' }}
        </button>
        <!-- Pas « Annuler » : on le confondrait avec l'annulation de la sortie elle-même. -->
        <RouterLink class="bouton bouton--secondaire" :to="retour">Revenir sans enregistrer</RouterLink>
      </div>
    </form>
  </section>
</template>
