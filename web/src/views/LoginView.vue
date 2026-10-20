<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/http';
import { cheminDeRetour } from '../router/redirection';
import { useSessionStore } from '../stores/session';

type Champ = 'email' | 'motDePasse';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const email = ref('');
const motDePasse = ref('');
const motDePasseVisible = ref(false);
const envoiEnCours = ref(false);

// Une erreur par champ (affichée sous le champ) + une erreur générale (refus de l'API).
const erreursChamps = reactive<Partial<Record<Champ, string>>>({});
const erreurGenerale = ref<string | null>(null);
const resumeErreurs = ref<HTMLElement | null>(null);

const LIBELLES: Record<Champ, string> = { email: 'Adresse e-mail', motDePasse: 'Mot de passe' };
const IDS: Record<Champ, string> = { email: 'connexion-email', motDePasse: 'connexion-mot-de-passe' };

// R-AUTH-6 : on explique pourquoi la personne se retrouve ici.
const sessionExpiree = computed(() => route.query.raison === 'session-expiree');

// Le lien vers l'inscription garde la page demandée, pour y revenir après.
const lienInscription = computed(() => ({ name: 'inscription', query: route.query.redirect ? { redirect: route.query.redirect } : {} }));

const listeErreurs = computed(() =>
  (Object.keys(erreursChamps) as Champ[])
    .filter((champ) => erreursChamps[champ])
    .map((champ) => ({ champ, message: erreursChamps[champ] as string })),
);
const aDesErreurs = computed(() => listeErreurs.value.length > 0 || erreurGenerale.value !== null);

// Vérifications côté navigateur : elles aident à corriger vite, mais l'API revalide tout.
function valider(): void {
  delete erreursChamps.email;
  delete erreursChamps.motDePasse;

  const adresse = email.value.trim();
  if (!adresse) erreursChamps.email = 'Saisissez votre adresse e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse))
    erreursChamps.email = 'Saisissez une adresse e-mail complète, par exemple nom@exemple.fr.';

  if (!motDePasse.value) erreursChamps.motDePasse = 'Saisissez votre mot de passe.';
  else if (motDePasse.value.length < 12)
    erreursChamps.motDePasse = 'Votre mot de passe contient au moins 12 caractères.';
}

// Traduit un refus de l'API en message compréhensible. Les messages de l'API sont déjà
// rédigés pour les membres ; on ne montre jamais de détail technique.
function messagePourErreur(erreur: unknown): string {
  if (!(erreur instanceof ApiError)) return 'Une erreur est survenue. Merci de réessayer.';
  switch (erreur.code) {
    case 'INVALID_CREDENTIALS':
      // R-AUTH-5 : même message pour un e-mail inconnu et un mauvais mot de passe.
      return 'Adresse e-mail ou mot de passe incorrect.';
    case 'ACCOUNT_SUSPENDED':
      return "Ce compte est suspendu. Vous ne pouvez pas vous connecter pour le moment.";
    case 'TOO_MANY_REQUESTS':
      return 'Trop de tentatives de connexion. Merci de patienter un quart d\'heure avant de réessayer.';
    case 'VALIDATION_FAILED':
      return 'Vérifiez votre adresse e-mail et votre mot de passe.';
    default:
      return erreur.message;
  }
}

async function afficherResume(): Promise<void> {
  await nextTick();
  resumeErreurs.value?.focus();
}

function allerAuChamp(champ: Champ): void {
  document.getElementById(IDS[champ])?.focus();
}

async function seConnecter(): Promise<void> {
  if (envoiEnCours.value) return;
  erreurGenerale.value = null;
  valider();
  if (listeErreurs.value.length > 0) {
    await afficherResume();
    return;
  }

  envoiEnCours.value = true;
  try {
    await session.connexion({ email: email.value.trim(), password: motDePasse.value });
    // Retour à la page demandée, seulement si c'est une page de l'application.
    await router.replace(cheminDeRetour(route.query.redirect));
  } catch (erreur) {
    erreurGenerale.value = messagePourErreur(erreur);
    await afficherResume();
  } finally {
    envoiEnCours.value = false;
  }
}

// Relie le champ à son message d'erreur : le lecteur d'écran le lit en entrant dans le champ.
function descriptionChamp(champ: Champ): string | undefined {
  return erreursChamps[champ] ? `${IDS[champ]}-erreur` : undefined;
}
</script>

<template>
  <h2>Connexion</h2>

  <p v-if="sessionExpiree" class="message message--info" role="status">
    Votre session a expiré, merci de vous reconnecter.
  </p>

  <section class="carte formulaire" aria-labelledby="titre-connexion">
    <h3 id="titre-connexion" class="visuellement-cache">Formulaire de connexion</h3>

    <!-- Résumé des erreurs : reçoit le focus, donc lu en premier par les lecteurs d'écran. -->
    <div
      v-if="aDesErreurs"
      ref="resumeErreurs"
      class="message message--erreur resume-erreurs"
      role="alert"
      tabindex="-1"
    >
      <p v-if="erreurGenerale" class="resume-erreurs__titre">{{ erreurGenerale }}</p>
      <template v-else>
        <p class="resume-erreurs__titre">Le formulaire contient {{ listeErreurs.length > 1 ? `${listeErreurs.length} erreurs` : 'une erreur' }} :</p>
        <ul>
          <li v-for="item in listeErreurs" :key="item.champ">
            <a :href="`#${IDS[item.champ]}`" @click.prevent="allerAuChamp(item.champ)">
              {{ LIBELLES[item.champ] }} : {{ item.message }}
            </a>
          </li>
        </ul>
      </template>
    </div>

    <form novalidate @submit.prevent="seConnecter">
      <div class="champ">
        <label :for="IDS.email">{{ LIBELLES.email }}</label>
        <input
          :id="IDS.email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          :aria-invalid="erreursChamps.email ? 'true' : undefined"
          :aria-describedby="descriptionChamp('email')"
        />
        <p v-if="erreursChamps.email" :id="`${IDS.email}-erreur`" class="champ__erreur">
          {{ erreursChamps.email }}
        </p>
      </div>

      <div class="champ">
        <label :for="IDS.motDePasse">{{ LIBELLES.motDePasse }}</label>
        <div class="champ__groupe">
          <input
            :id="IDS.motDePasse"
            v-model="motDePasse"
            :type="motDePasseVisible ? 'text' : 'password'"
            name="password"
            autocomplete="current-password"
            :aria-invalid="erreursChamps.motDePasse ? 'true' : undefined"
            :aria-describedby="descriptionChamp('motDePasse')"
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
        {{ envoiEnCours ? 'Connexion en cours…' : 'Se connecter' }}
      </button>
      <p v-if="envoiEnCours" class="visuellement-cache" role="status">Connexion en cours, merci de patienter.</p>
    </form>
  </section>

  <p class="lien-secondaire">
    Pas encore de compte ?
    <RouterLink :to="lienInscription">Créer un compte</RouterLink>
  </p>
</template>
