<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/http';
import { useSessionStore } from '../stores/session';

type Champ = 'email' | 'nomAffiche' | 'motDePasse';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const email = ref('');
const nomAffiche = ref('');
const motDePasse = ref('');
const motDePasseVisible = ref(false);
const envoiEnCours = ref(false);
const compteCree = ref(false);
const emailDejaUtilise = ref(false);

const erreursChamps = reactive<Partial<Record<Champ, string>>>({});
const erreurGenerale = ref<string | null>(null);
const resumeErreurs = ref<HTMLElement | null>(null);
const messageSucces = ref<HTMLElement | null>(null);


const LIBELLES: Record<Champ, string> = {
  email: 'Adresse e-mail',
  nomAffiche: 'Nom affiché',
  motDePasse: 'Mot de passe',
};
const IDS: Record<Champ, string> = {
  email: 'inscription-email',
  nomAffiche: 'inscription-nom',
  motDePasse: 'inscription-mot-de-passe',
};

const CHAMPS_API: Record<string, Champ> = { email: 'email', displayName: 'nomAffiche', password: 'motDePasse' };

const lienConnexion = computed(() => ({
  name: 'connexion',
  query: route.query.redirect ? { redirect: route.query.redirect } : {},
}));

const listeErreurs = computed(() =>
  (Object.keys(LIBELLES) as Champ[])
    .filter((champ) => erreursChamps[champ])
    .map((champ) => ({ champ, message: erreursChamps[champ] as string })),
);
const aDesErreurs = computed(() => listeErreurs.value.length > 0 || erreurGenerale.value !== null);

function viderErreurs(): void {
  (Object.keys(LIBELLES) as Champ[]).forEach((champ) => delete erreursChamps[champ]);
  erreurGenerale.value = null;
  emailDejaUtilise.value = false;
}


function valider(): void {
  const adresse = email.value.trim();
  if (!adresse) erreursChamps.email = 'Saisissez votre adresse e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse))
    erreursChamps.email = 'Saisissez une adresse e-mail complète, par exemple nom@exemple.fr.';

  const nom = nomAffiche.value.trim();
  if (!nom) erreursChamps.nomAffiche = 'Choisissez le nom que verront les autres membres.';
  else if (nom.length < 2 || nom.length > 40)
    erreursChamps.nomAffiche = 'Le nom affiché doit contenir entre 2 et 40 caractères.';

  if (!motDePasse.value) erreursChamps.motDePasse = 'Choisissez un mot de passe.';
  else if (motDePasse.value.length < 12)
    erreursChamps.motDePasse = `Le mot de passe doit contenir au moins 12 caractères (actuellement ${motDePasse.value.length}).`;
  else if (motDePasse.value.length > 128)
    erreursChamps.motDePasse = 'Le mot de passe ne doit pas dépasser 128 caractères.';
}


function traiterErreur(erreur: unknown): void {
  if (!(erreur instanceof ApiError)) {
    erreurGenerale.value = 'Une erreur est survenue. Merci de réessayer.';
    return;
  }
  switch (erreur.code) {
    case 'EMAIL_ALREADY_USED':
      erreursChamps.email = 'Un compte existe déjà avec cette adresse.';
      emailDejaUtilise.value = true;
      return;
    case 'VALIDATION_FAILED': {

      const champs = erreur.details.map((d) => CHAMPS_API[d.field]).filter(Boolean);
      champs.forEach((champ) => (erreursChamps[champ] = `Vérifiez ce champ : ${LIBELLES[champ].toLowerCase()} invalide.`));
      if (champs.length === 0) erreurGenerale.value = erreur.message;
      return;
    }
    case 'TOO_MANY_REQUESTS':
      erreurGenerale.value = 'Trop de comptes créés depuis cet appareil. Merci de réessayer dans une heure.';
      return;
    default:
      erreurGenerale.value = erreur.message;
  }
}

function allerAuChamp(champ: Champ): void {
  document.getElementById(IDS[champ])?.focus();
}

function descriptionChamp(champ: Champ, aide?: string): string | undefined {
  const ids = [aide, erreursChamps[champ] ? `${IDS[champ]}-erreur` : undefined].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

async function creerCompte(): Promise<void> {
  if (envoiEnCours.value) return;
  viderErreurs();
  valider();
  if (!aDesErreurs.value) {
    envoiEnCours.value = true;
    try {

      await session.inscription({
        email: email.value.trim(),
        displayName: nomAffiche.value.trim(),
        password: motDePasse.value,
      });
      compteCree.value = true;
      await nextTick();
      messageSucces.value?.focus();
      return;
    } catch (erreur) {
      traiterErreur(erreur);
    } finally {
      envoiEnCours.value = false;
    }
  }
  await nextTick();
  resumeErreurs.value?.focus();
}

// Prochaine étape annoncée dans le message : compléter son profil (R-PROF-1, R-PROF-2).
function continuer(): void {
  void router.push({ name: 'mon-profil' });
}
</script>

<template>
  <h2>Créer un compte</h2>


  <section
    v-if="compteCree"
    ref="messageSucces"
    class="carte formulaire message--succes"
    tabindex="-1"
    aria-labelledby="titre-succes"
  >
    <h3 id="titre-succes">Bienvenue {{ session.utilisateur?.displayName }} !</h3>
    <p>Votre compte est créé et vous êtes connecté.</p>
    <p>
      <strong>Prochaine étape :</strong> complétez votre profil (ville et centres d'intérêt). Un modérateur
      le vérifiera ; une fois approuvé, vous pourrez découvrir les autres membres et vous inscrire aux
      sorties.
    </p>
    <button type="button" class="bouton" @click="continuer">Compléter mon profil</button>
  </section>

  <template v-else>
    <p>Quelques informations suffisent. Vous compléterez votre profil ensuite.</p>

    <section class="carte formulaire" aria-labelledby="titre-inscription">
      <h3 id="titre-inscription" class="visuellement-cache">Formulaire d'inscription</h3>

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

      <form novalidate @submit.prevent="creerCompte">
        <div class="champ">
          <label :for="IDS.email">{{ LIBELLES.email }}</label>
          <p id="inscription-email-aide" class="champ__aide">Elle ne sera jamais montrée aux autres membres.</p>
          <input
            :id="IDS.email"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            :aria-invalid="erreursChamps.email ? 'true' : undefined"
            :aria-describedby="descriptionChamp('email', 'inscription-email-aide')"
          />
          <p v-if="erreursChamps.email" :id="`${IDS.email}-erreur`" class="champ__erreur">
            {{ erreursChamps.email }}
            <RouterLink v-if="emailDejaUtilise" :to="lienConnexion">
              Aller à la connexion
            </RouterLink>
          </p>
        </div>

        <div class="champ">
          <label :for="IDS.nomAffiche">{{ LIBELLES.nomAffiche }}</label>
          <p id="inscription-nom-aide" class="champ__aide">
            Votre prénom ou un pseudo, de 2 à 40 caractères. Évitez votre nom complet.
          </p>
          <input
            :id="IDS.nomAffiche"
            v-model="nomAffiche"
            type="text"
            name="displayName"
            autocomplete="nickname"
            maxlength="40"
            :aria-invalid="erreursChamps.nomAffiche ? 'true' : undefined"
            :aria-describedby="descriptionChamp('nomAffiche', 'inscription-nom-aide')"
          />
          <p v-if="erreursChamps.nomAffiche" :id="`${IDS.nomAffiche}-erreur`" class="champ__erreur">
            {{ erreursChamps.nomAffiche }}
          </p>
        </div>

        <div class="champ">
          <label :for="IDS.motDePasse">{{ LIBELLES.motDePasse }}</label>
          <p id="inscription-mot-de-passe-aide" class="champ__aide">
            Au moins 12 caractères. Une courte phrase est facile à retenir, par exemple « mon chat aime le jardin ».
          </p>
          <div class="champ__groupe">
            <input
              :id="IDS.motDePasse"
              v-model="motDePasse"
              :type="motDePasseVisible ? 'text' : 'password'"
              name="password"
              autocomplete="new-password"
              :aria-invalid="erreursChamps.motDePasse ? 'true' : undefined"
              :aria-describedby="descriptionChamp('motDePasse', 'inscription-mot-de-passe-aide')"
            />
            <button
              type="button"
              class="bouton bouton--secondaire"
              :aria-pressed="motDePasseVisible"
              :aria-controls="IDS.motDePasse"
              @click="motDePasseVisible = !motDePasseVisible"
            >
              {{ motDePasseVisible ? 'Masquer' : 'Afficher' }}<span class="visuellement-cache"> le mot de passe</span>
            </button>
          </div>
          <p v-if="erreursChamps.motDePasse" :id="`${IDS.motDePasse}-erreur`" class="champ__erreur">
            {{ erreursChamps.motDePasse }}
          </p>
        </div>

        <button type="submit" class="bouton" :disabled="envoiEnCours">
          {{ envoiEnCours ? 'Création en cours…' : 'Créer mon compte' }}
        </button>
        <p v-if="envoiEnCours" class="visuellement-cache" role="status">Création du compte en cours, merci de patienter.</p>
      </form>
    </section>

    <p class="lien-secondaire">
      Déjà inscrit ?
      <RouterLink :to="lienConnexion">Se connecter</RouterLink>
    </p>
  </template>
</template>
