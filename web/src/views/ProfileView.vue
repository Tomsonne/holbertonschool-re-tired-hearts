<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ApiError } from '../api/http';
import { searchCities, type CityResult } from '../api/cities';
import { fetchInterests, type Interest } from '../api/interests';
import {
  fetchMyProfile,
  updateMyProfile,
  type ManquePourApprobation,
  type OwnProfile,
  type ProfileInput,
  type Recherche,
} from '../api/profil';
import { useSessionStore } from '../stores/session';

// Écran « Mon profil » (mission 9). Contrats : GET et PUT /api/me/profile.
// Règles : statuts (§2), profil et confidentialité (R-PROF-1 à 6), localisation (R-LOC-1 à 3).
// Les contrôles faits ici aident à corriger vite ; l'API revalide et autorise tout.

type Champ = 'nomAffiche' | 'presentation' | 'interets' | 'ville' | 'codePostal' | 'departement';

const session = useSessionStore();

// ---------- Chargement : les quatre états ----------
const etat = ref<'chargement' | 'erreur' | 'pret'>('chargement');
const erreurChargement = ref('');
const profil = ref<OwnProfile | null>(null);
const referentiel = ref<Interest[]>([]);

// ---------- Formulaire ----------
const form = reactive({
  nomAffiche: '',
  presentation: '',
  recherche: [] as Recherche[],
  interets: [] as number[],
  ville: '',
  codePostal: '',
  departement: '',
  decouvrable: true,
  accepteMessages: true,
});
const envoiEnCours = ref(false);
const enregistre = ref(false);
const erreursChamps = reactive<Partial<Record<Champ, string>>>({});
const erreurGenerale = ref<string | null>(null);
const suggestions = ref<CityResult[]>([]);
const rechercheManuelle = ref(false);
const rechercheEnCours = ref(false);
const communeChoisie = ref<CityResult | null>(null);
const localisationModifiee = ref(false);
let rechercheTimer: ReturnType<typeof setTimeout> | undefined;
let rechercheVersion = 0;

function invaliderRecherche(): number {
  clearTimeout(rechercheTimer);
  rechercheTimer = undefined;
  rechercheEnCours.value = false;
  suggestions.value = [];
  return ++rechercheVersion;
}

const resumeErreurs = ref<HTMLElement | null>(null);
const messageSucces = ref<HTMLElement | null>(null);
const bandeauStatut = ref<HTMLElement | null>(null);

const MAX_INTERETS = 10;
const MAX_PRESENTATION = 500;

// L'ordre des clés est l'ordre des champs à l'écran : le résumé d'erreurs suit le même ordre.
const LIBELLES: Record<Champ, string> = {
  nomAffiche: 'Nom affiché',
  presentation: 'Présentation',
  interets: "Centres d'intérêt",
  ville: 'Ville',
  codePostal: 'Code postal',
  departement: 'Département',
};
const IDS: Record<Champ, string> = {
  nomAffiche: 'profil-nom',
  presentation: 'profil-presentation',
  interets: 'profil-interets',
  ville: 'profil-ville',
  codePostal: 'profil-code-postal',
  departement: 'profil-departement',
};
// Nom des champs côté API (details[].field) → nos champs.
const CHAMPS_API: Record<string, Champ> = {
  displayName: 'nomAffiche',
  bio: 'presentation',
  interestIds: 'interets',
  location: 'ville',
  'location.cityName': 'ville',
  'location.postalCode': 'codePostal',
  'location.departmentCode': 'departement',
};

const RECHERCHES: { valeur: Recherche; libelle: string }[] = [
  { valeur: 'friendship', libelle: 'Amitié' },
  { valeur: 'companionship', libelle: 'Compagnie' },
  { valeur: 'romance', libelle: 'Relation amoureuse' },
  { valeur: 'activities', libelle: 'Activités partagées' },
];

// Ce qui manque pour l'approbation, avec le champ où le corriger.
const MANQUES: Record<ManquePourApprobation, { texte: string; champ: Champ }> = {
  displayName: { texte: 'votre nom affiché', champ: 'nomAffiche' },
  location: { texte: 'votre ville et son département', champ: 'ville' },
  interests: { texte: "au moins un centre d'intérêt", champ: 'interets' },
};

const estBloque = computed(() => profil.value?.status === 'blocked');
const estApprouve = computed(() => profil.value?.status === 'approved');

// État « vide » : profil tout juste créé à l'inscription, rien n'est encore rempli.
const profilVide = computed(() => {
  const p = profil.value;
  return !!p && p.interests.length === 0 && p.location === null && !p.bio && p.lookingFor.length === 0;
});

// Plafond atteint : les cases restantes sont désactivées et un message l'explique tout de suite,
// plutôt qu'une erreur à l'enregistrement.
const plafondInterets = computed(() => form.interets.length >= MAX_INTERETS);
const caseBloquee = (id: number) => plafondInterets.value && !form.interets.includes(id);

const manques = computed(() => (profil.value?.missingForApproval ?? []).filter((m) => m in MANQUES));

// R-LOC-2 : les membres ne voient que « Ville (département) ».
const apercuLocalisation = computed(() => {
  const ville = form.ville.trim();
  const departement = form.departement.trim().toUpperCase();
  return ville && departement ? `${ville} (${departement})` : null;
});

const listeErreurs = computed(() =>
  (Object.keys(LIBELLES) as Champ[])
    .filter((champ) => erreursChamps[champ])
    .map((champ) => ({ champ, message: erreursChamps[champ] as string })),
);
const aDesErreurs = computed(() => listeErreurs.value.length > 0 || erreurGenerale.value !== null);

function remplirFormulaire(p: OwnProfile): void {
  invaliderRecherche();
  form.nomAffiche = p.displayName;
  form.presentation = p.bio ?? '';
  form.recherche = [...p.lookingFor];
  form.interets = p.interests.map((i) => i.id);
  form.ville = p.location?.cityName ?? '';
  form.codePostal = p.location?.postalCode ?? '';
  form.departement = p.location?.departmentCode ?? '';
  communeChoisie.value = null;
  localisationModifiee.value = false;
  rechercheManuelle.value = false;
  form.decouvrable = p.discoverable;
  form.accepteMessages = p.allowMessages;
}

function saisirVille(): void {
  localisationModifiee.value = true;
  communeChoisie.value = null;
  const version = invaliderRecherche();
  const query = form.ville.trim();
  if (rechercheManuelle.value || query.length < 2) return;
  rechercheTimer = setTimeout(async () => {
    rechercheTimer = undefined;
    rechercheEnCours.value = true;
    try {
      const resultats = await searchCities(query);
      if (version !== rechercheVersion) return;
      suggestions.value = resultats;
      if (resultats.length === 0) rechercheManuelle.value = true;
    } catch {
      if (version === rechercheVersion) rechercheManuelle.value = true;
    } finally {
      if (version === rechercheVersion) rechercheEnCours.value = false;
    }
  }, 300);
}

function choisirCommune(commune: CityResult): void {
  invaliderRecherche();
  communeChoisie.value = commune;
  form.ville = commune.cityName;
  form.departement = commune.departmentCode;
  form.codePostal = commune.postalCodes[0] ?? '';
  localisationModifiee.value = true;
}

function saisirLocalisation(): void {
  // La commune choisie n'est pas annulée ici : selectionValide revalide ville, département et
  // code postal à l'enregistrement. Un autre code postal de la même commune — Toulouse en a six —
  // garde donc son code INSEE, et un code étranger reste refusé par ce même garde.
  localisationModifiee.value = true;
}

function passerEnManuel(): void {
  invaliderRecherche();
  rechercheManuelle.value = true;
  saisirLocalisation();
}

function recevoirProfil(p: OwnProfile): void {
  profil.value = p;
  remplirFormulaire(p);
  session.synchroniserProfil(p);
}

async function charger(): Promise<void> {
  etat.value = 'chargement';
  erreurChargement.value = '';
  try {
    const [p, interets] = await Promise.all([fetchMyProfile(), fetchInterests()]);
    referentiel.value = interets;
    recevoirProfil(p);
    etat.value = 'pret';
  } catch (erreur) {
    // Session expirée : le routeur renvoie déjà vers la connexion (R-AUTH-6).
    erreurChargement.value =
      erreur instanceof ApiError ? erreur.message : 'Une erreur est survenue. Merci de réessayer.';
    etat.value = 'erreur';
  }
}

onMounted(charger);
onUnmounted(invaliderRecherche);

function viderErreurs(): void {
  (Object.keys(LIBELLES) as Champ[]).forEach((champ) => delete erreursChamps[champ]);
  erreurGenerale.value = null;
}

// Mêmes règles que ProfileInputDto. L'API revalide tout.
function valider(): void {
  const nom = form.nomAffiche.trim();
  if (!nom) erreursChamps.nomAffiche = 'Indiquez le nom que verront les autres membres.';
  else if (nom.length < 2 || nom.length > 40)
    erreursChamps.nomAffiche = 'Le nom affiché doit contenir entre 2 et 40 caractères.';

  if (form.presentation.trim().length > MAX_PRESENTATION)
    erreursChamps.presentation = `La présentation ne doit pas dépasser ${MAX_PRESENTATION} caractères.`;

  if (form.interets.length > MAX_INTERETS)
    erreursChamps.interets = `Choisissez au plus ${MAX_INTERETS} centres d'intérêt (actuellement ${form.interets.length}).`;

  const ville = form.ville.trim();
  const codePostal = form.codePostal.trim();
  const departement = form.departement.trim().toUpperCase();
  const localisationVide = !ville && !codePostal && !departement;

  if (localisationVide) {
    // R-PROF-5 : la ville se modifie mais ne se retire pas d'un profil approuvé.
    if (estApprouve.value)
      erreursChamps.ville = "Votre profil est approuvé : la ville peut être changée, mais pas retirée.";
    return;
  }
  if (!ville) erreursChamps.ville = 'Indiquez le nom de votre ville.';
  else if (ville.length > 100) erreursChamps.ville = 'Le nom de la ville ne doit pas dépasser 100 caractères.';
  // Code postal facultatif (règles métier §3) : vérifié seulement s'il est saisi.
  if (codePostal && !/^[0-9]{5}$/.test(codePostal))
    erreursChamps.codePostal = 'Saisissez les 5 chiffres du code postal, par exemple 31000, ou laissez le champ vide.';
  if (!/^(?:[0-9]{2}|2[AB]|97[1-6])$/.test(departement))
    erreursChamps.departement = 'Saisissez le numéro du département, par exemple 31, 2A ou 974.';
}

function construireRequete(): ProfileInput {
  const ville = form.ville.trim();
  const codePostal = form.codePostal.trim();
  const departement = form.departement.trim().toUpperCase();
  const avant = profil.value?.location ?? null;
  // Une commune choisie via la recherche (#29) garde son code INSEE tant qu'elle n'est pas modifiée.
  // Toute saisie manuelle est enregistrée « non vérifiée » (R-LOC-3).
  const inchangee =
    avant !== null &&
    avant.cityName === ville &&
    avant.postalCode === (codePostal || null) &&
    avant.departmentCode === departement && !localisationModifiee.value;
  const selectionValide = communeChoisie.value?.cityName === ville &&
    communeChoisie.value?.departmentCode === departement &&
    communeChoisie.value?.postalCodes.includes(codePostal);
  const presentation = form.presentation.trim();

  return {
    displayName: form.nomAffiche.trim(),
    bio: presentation || null,
    lookingFor: [...form.recherche],
    interestIds: [...form.interets],
    location: ville
      ? {
          cityName: ville,
          postalCode: codePostal || null,
          departmentCode: departement,
          cityCode: selectionValide ? communeChoisie.value!.cityCode : inchangee ? avant.cityCode : null,
          verified: selectionValide ? true : inchangee ? avant.verified : false,
        }
      : null,
    discoverable: form.decouvrable,
    allowMessages: form.accepteMessages,
  };
}

// Les refus de l'API sont rangés sous le bon champ quand c'est possible.
function traiterErreur(erreur: unknown): 'bloque' | 'formulaire' {
  if (!(erreur instanceof ApiError)) {
    erreurGenerale.value = 'Une erreur est survenue. Merci de réessayer.';
    return 'formulaire';
  }
  switch (erreur.code) {
    case 'PROFILE_BLOCKED':
      // Bloqué par un modérateur pendant l'édition : l'écran passe en lecture seule.
      if (profil.value) {
        profil.value = { ...profil.value, status: 'blocked' };
        session.synchroniserProfil(profil.value);
      }
      return 'bloque';
    case 'VALIDATION_FAILED': {
      // Les messages détaillés de l'API sont techniques (en anglais) : on garde seulement le champ.
      const champs = [...new Set(erreur.details.map((d) => CHAMPS_API[d.field]).filter(Boolean))];
      champs.forEach((champ) => (erreursChamps[champ] = `Vérifiez ce champ : ${LIBELLES[champ].toLowerCase()} invalide.`));
      if (champs.length === 0) erreurGenerale.value = erreur.message;
      return 'formulaire';
    }
    default:
      erreurGenerale.value = erreur.message;
      return 'formulaire';
  }
}

async function enregistrer(): Promise<void> {
  if (envoiEnCours.value || estBloque.value) return;
  enregistre.value = false;
  viderErreurs();
  valider();
  if (!aDesErreurs.value) {
    envoiEnCours.value = true;
    try {
      recevoirProfil(await updateMyProfile(construireRequete()));
      enregistre.value = true;
      await nextTick();
      messageSucces.value?.focus();
      return;
    } catch (erreur) {
      if (traiterErreur(erreur) === 'bloque') {
        await nextTick();
        bandeauStatut.value?.focus();
        return;
      }
    } finally {
      envoiEnCours.value = false;
    }
  }
  await nextTick();
  resumeErreurs.value?.focus();
}

// Un groupe de cases n'est pas focalisable : on va sur sa première case.
function allerAuChamp(champ: Champ): void {
  const cible =
    champ === 'interets'
      ? document.querySelector<HTMLElement>(`#${IDS.interets} input`)
      : document.getElementById(IDS[champ]);
  cible?.focus();
}

function descriptionChamp(champ: Champ, aide?: string): string | undefined {
  const ids = [aide, erreursChamps[champ] ? `${IDS[champ]}-erreur` : undefined].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

const libelleRecherche = (valeur: Recherche) => RECHERCHES.find((r) => r.valeur === valeur)?.libelle ?? valeur;
const membreDepuis = computed(() =>
  profil.value
    ? new Date(`${profil.value.memberSince}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : '',
);
</script>

<template>
  <h2 class="titre-orne">Mon profil</h2>

  <!-- Chargement : annoncé aux lecteurs d'écran. -->
  <p v-if="etat === 'chargement'" class="message" role="status">Chargement de votre profil…</p>

  <!-- Erreur : message lisible + reprise, jamais de détail technique. -->
  <div v-else-if="etat === 'erreur'" class="message message--erreur" role="alert">
    <p>Votre profil n'a pas pu être chargé. {{ erreurChargement }}</p>
    <button type="button" class="bouton" @click="charger">Réessayer</button>
  </div>

  <template v-else-if="profil">
    <!-- Bandeau de statut : le titre dit le statut en toutes lettres, la couleur n'est qu'un appui. -->
    <section
      ref="bandeauStatut"
      class="message bandeau-profil"
      :class="{
        'message--info': profil.status === 'pending',
        'message--succes': profil.status === 'approved',
        'message--erreur': profil.status === 'blocked',
      }"
      tabindex="-1"
      aria-labelledby="titre-statut"
    >
      <template v-if="profil.status === 'pending'">
        <h3 id="titre-statut">Profil en attente de vérification</h3>
        <template v-if="manques.length">
          <p>Pour qu'un modérateur puisse l'approuver, il manque :</p>
          <ul>
            <li v-for="manque in manques" :key="manque">
              <a :href="`#${IDS[MANQUES[manque].champ]}`" @click.prevent="allerAuChamp(MANQUES[manque].champ)">
                {{ MANQUES[manque].texte }}
              </a>
            </li>
          </ul>
        </template>
        <p v-else>Votre profil est complet : un modérateur va le vérifier.</p>
        <p>
          En attendant, vous pouvez consulter les sorties. Découvrir les membres, vous inscrire et
          écrire des messages seront possibles après l'approbation.
        </p>
      </template>

      <template v-else-if="profil.status === 'approved'">
        <h3 id="titre-statut">Profil approuvé</h3>
        <p v-if="profil.discoverable">
          Les autres membres peuvent découvrir votre profil. Vos modifications sont visibles dès leur
          enregistrement.
        </p>
        <p v-else>
          Vous avez choisi de ne pas apparaître dans la découverte des membres. Vous pouvez changer ce
          choix plus bas, dans « Confidentialité ».
        </p>
      </template>

      <template v-else>
        <h3 id="titre-statut">Profil bloqué</h3>
        <p>
          Un modérateur a bloqué votre profil. Il n'est plus visible des autres membres et ne peut plus
          être modifié. Vous pouvez encore consulter vos informations et vous déconnecter.
        </p>
      </template>
    </section>

    <!-- Bloqué : lecture seule (R-STATUS-2). Pas de formulaire, donc aucune requête PUT. -->
    <section v-if="estBloque" class="carte" aria-labelledby="titre-lecture">
      <h3 id="titre-lecture">Vos informations</h3>
      <dl class="fiche">
        <dt>Nom affiché</dt>
        <dd>{{ profil.displayName }}</dd>
        <dt>Présentation</dt>
        <dd>{{ profil.bio || 'Non renseignée' }}</dd>
        <dt>Ce que vous recherchez</dt>
        <dd>{{ profil.lookingFor.length ? profil.lookingFor.map(libelleRecherche).join(', ') : 'Non renseigné' }}</dd>
        <dt>Centres d'intérêt</dt>
        <dd>{{ profil.interests.length ? profil.interests.map((i) => i.label).join(', ') : 'Aucun' }}</dd>
        <dt>Ville</dt>
        <dd>
          {{ profil.location ? `${profil.location.cityName} (${profil.location.departmentCode})` : 'Non renseignée' }}
        </dd>
        <dt>Membre depuis</dt>
        <dd>{{ membreDepuis }}</dd>
      </dl>
    </section>

    <template v-else>
      <!-- Vide : profil tel que créé à l'inscription (R-PROF-1). -->
      <p v-if="profilVide" class="message">
        Votre profil n'est pas encore rempli. Commencez par votre ville et quelques centres d'intérêt :
        c'est ce qu'il faut pour qu'un modérateur l'approuve.
      </p>

      <!-- Succès : le focus y est placé, le lecteur d'écran l'annonce. -->
      <p
        v-if="enregistre"
        ref="messageSucces"
        class="message message--succes"
        role="status"
        tabindex="-1"
      >
        Vos modifications sont enregistrées.
      </p>

      <section class="carte formulaire-profil" aria-labelledby="titre-formulaire-profil">
        <h3 id="titre-formulaire-profil" class="visuellement-cache">Modifier mon profil</h3>

        <div
          v-if="aDesErreurs"
          ref="resumeErreurs"
          class="message message--erreur resume-erreurs"
          role="alert"
          tabindex="-1"
        >
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
          <!-- ===== Ce que voient les membres ===== -->
          <fieldset class="groupe">
            <legend>Ce que voient les autres membres</legend>

            <div class="champ">
              <label :for="IDS.nomAffiche">{{ LIBELLES.nomAffiche }}</label>
              <p id="profil-nom-aide" class="champ__aide">
                Votre prénom ou un pseudo, de 2 à 40 caractères. Évitez votre nom complet.
              </p>
              <input
                :id="IDS.nomAffiche"
                v-model="form.nomAffiche"
                type="text"
                name="displayName"
                autocomplete="nickname"
                maxlength="40"
                :aria-invalid="erreursChamps.nomAffiche ? 'true' : undefined"
                :aria-describedby="descriptionChamp('nomAffiche', 'profil-nom-aide')"
              />
              <p v-if="erreursChamps.nomAffiche" :id="`${IDS.nomAffiche}-erreur`" class="champ__erreur">
                {{ erreursChamps.nomAffiche }}
              </p>
            </div>

            <div class="champ">
              <label :for="IDS.presentation">{{ LIBELLES.presentation }} (facultatif)</label>
              <p id="profil-presentation-aide" class="champ__aide">
                Quelques mots sur vous et vos envies. {{ form.presentation.length }} sur {{ MAX_PRESENTATION }} caractères.
              </p>
              <textarea
                :id="IDS.presentation"
                v-model="form.presentation"
                name="bio"
                rows="4"
                :maxlength="MAX_PRESENTATION"
                :aria-invalid="erreursChamps.presentation ? 'true' : undefined"
                :aria-describedby="descriptionChamp('presentation', 'profil-presentation-aide')"
              ></textarea>
              <p v-if="erreursChamps.presentation" :id="`${IDS.presentation}-erreur`" class="champ__erreur">
                {{ erreursChamps.presentation }}
              </p>
            </div>

            <fieldset class="sous-groupe">
              <legend>Ce que vous recherchez (facultatif)</legend>
              <div class="grille-choix">
                <label v-for="r in RECHERCHES" :key="r.valeur" class="choix">
                  <input v-model="form.recherche" type="checkbox" name="lookingFor" :value="r.valeur" />
                  <span>{{ r.libelle }}</span>
                </label>
              </div>
            </fieldset>
          </fieldset>

          <!-- ===== Centres d'intérêt ===== -->
          <fieldset
            :id="IDS.interets"
            class="groupe"
            :aria-describedby="descriptionChamp('interets', 'profil-interets-aide')"
          >
            <legend>{{ LIBELLES.interets }}</legend>
            <p id="profil-interets-aide" class="champ__aide">
              De 1 à {{ MAX_INTERETS }}. Ils servent à vous proposer des sorties et des membres proches de vos goûts.
              <span class="compteur">{{ form.interets.length }} sur {{ MAX_INTERETS }} choisis.</span>
            </p>
            <!-- Toujours présent dans la page : le lecteur d'écran annonce le message dès qu'il apparaît. -->
            <p id="profil-interets-plafond" class="champ__aide" aria-live="polite">
              <template v-if="plafondInterets">
                Vous avez choisi le maximum de {{ MAX_INTERETS }}. Décochez-en un pour en choisir un autre.
              </template>
            </p>
            <p v-if="erreursChamps.interets" :id="`${IDS.interets}-erreur`" class="champ__erreur">
              {{ erreursChamps.interets }}
            </p>
            <p v-if="referentiel.length === 0" class="message">
              Aucun centre d'intérêt n'est disponible pour le moment.
            </p>
            <div v-else class="grille-choix">
              <label v-for="interet in referentiel" :key="interet.id" class="choix">
                <input
                  v-model="form.interets"
                  type="checkbox"
                  name="interestIds"
                  :value="interet.id"
                  :disabled="caseBloquee(interet.id)"
                  :aria-describedby="caseBloquee(interet.id) ? 'profil-interets-plafond' : undefined"
                />
                <span>{{ interet.label }}</span>
              </label>
            </div>
          </fieldset>

          <!-- ===== Localisation approximative ===== -->
          <fieldset class="groupe">
            <legend>Ma ville</legend>
            <p id="profil-ville-aide" class="champ__aide">
              Les autres membres voient seulement la ville et le département{{
                apercuLocalisation ? ` : « ${apercuLocalisation} »` : ''
              }}. Jamais votre adresse.
            </p>

            <div class="champ">
              <label :for="IDS.ville">{{ LIBELLES.ville }}</label>
              <input
                :id="IDS.ville"
                v-model="form.ville"
                @input="saisirVille"
                type="text"
                name="cityName"
                autocomplete="address-level2"
                maxlength="100"
                :aria-invalid="erreursChamps.ville ? 'true' : undefined"
                :aria-describedby="descriptionChamp('ville', 'profil-ville-aide')"
              />
              <p v-if="rechercheEnCours" role="status">Recherche de communes…</p>
              <ul v-if="suggestions.length && !rechercheManuelle" aria-label="Communes proposées">
                <li v-for="commune in suggestions" :key="commune.cityCode">
                  <button type="button" @click="choisirCommune(commune)">
                    {{ commune.cityName }} ({{ commune.departmentCode }}) — {{ commune.postalCodes.join(', ') }}
                  </button>
                </li>
              </ul>
              <p v-if="rechercheManuelle" role="status">Recherche indisponible ou sans résultat : saisissez la ville et le département ci-dessous. Le code postal est facultatif.</p>
              <button v-if="!rechercheManuelle" type="button" @click="passerEnManuel">Saisir ma ville manuellement</button>
              <p v-if="erreursChamps.ville" :id="`${IDS.ville}-erreur`" class="champ__erreur">
                {{ erreursChamps.ville }}
              </p>
            </div>

            <div class="ligne-champs">
              <div class="champ">
                <label :for="IDS.codePostal">{{ LIBELLES.codePostal }} (facultatif)</label>
                <p id="profil-code-postal-aide" class="champ__aide">Privé : il n'est jamais montré aux membres.</p>
                <input
                  :id="IDS.codePostal"
                  v-model="form.codePostal"
                  @input="saisirLocalisation"
                  type="text"
                  name="postalCode"
                  inputmode="numeric"
                  autocomplete="postal-code"
                  maxlength="5"
                  :aria-invalid="erreursChamps.codePostal ? 'true' : undefined"
                  :aria-describedby="descriptionChamp('codePostal', 'profil-code-postal-aide')"
                />
                <p v-if="erreursChamps.codePostal" :id="`${IDS.codePostal}-erreur`" class="champ__erreur">
                  {{ erreursChamps.codePostal }}
                </p>
              </div>

              <div class="champ">
                <label :for="IDS.departement">{{ LIBELLES.departement }}</label>
                <p id="profil-departement-aide" class="champ__aide">Son numéro, par exemple 31.</p>
                <input
                  :id="IDS.departement"
                  v-model="form.departement"
                  @input="saisirLocalisation"
                  type="text"
                  name="departmentCode"
                  maxlength="3"
                  :aria-invalid="erreursChamps.departement ? 'true' : undefined"
                  :aria-describedby="descriptionChamp('departement', 'profil-departement-aide')"
                />
                <p v-if="erreursChamps.departement" :id="`${IDS.departement}-erreur`" class="champ__erreur">
                  {{ erreursChamps.departement }}
                </p>
              </div>
            </div>
          </fieldset>

          <!-- ===== Confidentialité ===== -->
          <fieldset class="groupe">
            <legend>Confidentialité</legend>
            <p class="champ__aide">Votre adresse e-mail et votre code postal ne sont jamais montrés aux autres membres.</p>

            <div class="champ">
              <label class="choix">
                <input
                  id="profil-decouvrable"
                  v-model="form.decouvrable"
                  type="checkbox"
                  name="discoverable"
                  aria-describedby="profil-decouvrable-aide"
                />
                <span>Apparaître dans la découverte des membres</span>
              </label>
              <p id="profil-decouvrable-aide" class="champ__aide">
                Décochez pour ne plus figurer dans la liste des membres. Vos sorties et vos conversations continuent.
              </p>
            </div>

            <div class="champ">
              <label class="choix">
                <input
                  id="profil-messages"
                  v-model="form.accepteMessages"
                  type="checkbox"
                  name="allowMessages"
                  aria-describedby="profil-messages-aide"
                />
                <span>Accepter les messages des autres membres</span>
              </label>
              <p id="profil-messages-aide" class="champ__aide">
                Décochez pour que personne ne puisse commencer une conversation avec vous ni vous écrire.
              </p>
            </div>
          </fieldset>

          <button type="submit" class="bouton" :disabled="envoiEnCours">
            {{ envoiEnCours ? 'Enregistrement…' : 'Enregistrer mon profil' }}
          </button>
          <p v-if="envoiEnCours" class="visuellement-cache" role="status">Enregistrement en cours, merci de patienter.</p>
        </form>
      </section>
    </template>
  </template>
</template>
