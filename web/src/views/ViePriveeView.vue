<script setup lang="ts">
// Vie privée (mission 26), en langage simple : ce que voient les autres membres, ce qui reste
// privé, ce que voit la modération, comment les données sont traitées.
// Chaque affirmation correspond à une règle du projet (docs/regles-metier.md, docs/architecture.md) :
// si une règle change, cette page doit changer aussi.
</script>

<template>
  <article class="page-texte" aria-labelledby="titre-vie-privee">
    <h2 id="titre-vie-privee" class="titre-orne">Vos données et votre vie privée</h2>

    <p class="page-texte__chapo">
      Re-Tired Hearts sert à rencontrer des personnes près de chez vous. Pour cela, nous avons besoin de quelques
      informations. Cette page explique, simplement, qui voit quoi.
    </p>

    <nav class="page-texte__sommaire carte" aria-labelledby="titre-sommaire-vie-privee">
      <h3 id="titre-sommaire-vie-privee">Sur cette page</h3>
      <ol>
        <li><a href="#visible">Ce que les autres membres voient</a></li>
        <li><a href="#prive">Ce qui reste privé</a></li>
        <li><a href="#sorties">Les sorties et l'adresse du rendez-vous</a></li>
        <li><a href="#messages">Vos messages</a></li>
        <li><a href="#moderation">Ce que voit la modération</a></li>
        <li><a href="#traitement">Comment vos données sont traitées</a></li>
        <li><a href="#choix">Vos choix et vos droits</a></li>
      </ol>
    </nav>

    <section id="visible" aria-labelledby="titre-visible">
      <h3 id="titre-visible">1. Ce que les autres membres voient</h3>
      <p>
        Seuls les <strong>membres connectés dont le profil a été vérifié</strong> peuvent voir votre profil. Une
        personne qui n'a pas de compte ne voit aucun membre.
      </p>
      <p>Ils voient :</p>
      <ul>
        <li>votre <strong>nom affiché</strong> (un prénom ou un pseudo suffit : évitez votre nom complet) ;</li>
        <li>votre <strong>ville et votre département</strong>, par exemple « Toulouse (31) », jamais votre adresse ;</li>
        <li>vos <strong>centres d'intérêt</strong>, votre <strong>présentation</strong> et ce que vous recherchez, si vous les avez remplis ;</li>
        <li>le <strong>mois et l'année</strong> de votre inscription ;</li>
        <li>si vous acceptez ou non les messages, et si vous organisez des sorties.</li>
      </ul>
      <p>
        Votre profil n'apparaît à personne tant qu'un modérateur ne l'a pas vérifié. Vous pouvez aussi choisir de ne
        pas apparaître dans la liste des membres, dans « Mon profil ».
      </p>
    </section>

    <section id="prive" aria-labelledby="titre-prive">
      <h3 id="titre-prive">2. Ce qui reste privé</h3>
      <p>Les autres membres ne voient <strong>jamais</strong> :</p>
      <ul>
        <li>votre <strong>adresse e-mail</strong> ;</li>
        <li>votre <strong>code postal</strong> ;</li>
        <li>votre <strong>mot de passe</strong> : personne ne le voit, pas même l'équipe. Il est enregistré sous une forme brouillée qui ne permet pas de le retrouver.</li>
      </ul>
    </section>

    <section id="sorties" aria-labelledby="titre-sorties-vie-privee">
      <h3 id="titre-sorties-vie-privee">3. Les sorties et l'adresse du rendez-vous</h3>
      <p>
        Chaque sortie indique une ville et un repère approximatif, par exemple « près du kiosque ». L'<strong>adresse
        exacte</strong> du rendez-vous n'est montrée qu'aux personnes <strong>inscrites</strong>, à l'organisateur et
        aux modérateurs.
      </p>
      <p>
        La liste des participants d'une sortie (leur nom affiché) n'est visible que par l'organisateur, les autres
        personnes inscrites et les modérateurs. Si vous vous désinscrivez, vous n'y figurez plus et l'adresse exacte
        ne vous est plus montrée.
      </p>
    </section>

    <section id="messages" aria-labelledby="titre-messages-vie-privee">
      <h3 id="titre-messages-vie-privee">4. Vos messages</h3>
      <ul>
        <li>
          On ne peut vous écrire que si vous avez participé à une <strong>même sortie</strong>, ou si l'un de vous
          organise une sortie à laquelle l'autre est inscrit.
        </li>
        <li>
          Une conversation n'est lisible que par les <strong>deux personnes</strong> qui y participent.
          <strong>Les modérateurs ne peuvent pas lire vos messages.</strong>
        </li>
        <li>Vous pouvez refuser tout nouveau message, à tout moment, dans « Mon profil ».</li>
      </ul>
    </section>

    <section id="moderation" aria-labelledby="titre-moderation-vie-privee">
      <h3 id="titre-moderation-vie-privee">5. Ce que voit la modération</h3>
      <p>
        Les modérateurs vérifient les nouveaux profils pour protéger les membres contre les faux comptes et les
        arnaques. Pour cela, ils voient votre e-mail, votre code postal, les informations de votre profil et le
        détail des sorties.
      </p>
      <p>
        Chaque décision d'un modérateur (approuver, bloquer, suspendre, annuler une sortie) est notée dans un journal
        avec sa date et son motif. Ce journal ne contient <strong>jamais</strong> de mot de passe ni de message.
      </p>
    </section>

    <section id="traitement" aria-labelledby="titre-traitement">
      <h3 id="titre-traitement">6. Comment vos données sont traitées</h3>
      <ul>
        <li>
          <strong>Pour vous reconnaître</strong> : quand vous vous connectez, votre navigateur garde un petit fichier
          de connexion (un « cookie ») pendant <strong>2 heures</strong> au maximum. C'est le seul cookie du site :
          il n'y a ni publicité, ni mesure d'audience.
        </li>
        <li>
          <strong>Pour vous protéger</strong> : pour bloquer les tentatives répétées de connexion ou d'inscription, le
          serveur compte pendant un court moment les essais venant d'une même connexion internet.
        </li>
        <li>
          <strong>Pour trouver votre ville</strong> : quand vous tapez le nom de votre ville, seules les lettres
          tapées sont envoyées au service public de recherche des communes (geo.api.gouv.fr). Votre nom et votre profil
          ne le sont jamais.
        </li>
        <li>Vos données ne sont <strong>ni vendues, ni partagées</strong> avec d'autres entreprises.</li>
        <li>
          Les comptes ne sont pas supprimés automatiquement : un compte qui pose problème est suspendu, et son
          historique est conservé.
        </li>
      </ul>
    </section>

    <section id="choix" aria-labelledby="titre-choix">
      <h3 id="titre-choix">7. Vos choix et vos droits</h3>
      <p>Depuis « Mon profil », vous pouvez à tout moment :</p>
      <ul>
        <li>corriger ou effacer votre présentation, vos centres d'intérêt et ce que vous recherchez ;</li>
        <li>ne plus apparaître dans la liste des membres ;</li>
        <li>refuser les nouveaux messages.</li>
      </ul>
      <p>
        Changer d'adresse e-mail, supprimer votre compte ou obtenir une copie de vos données n'est pas encore possible
        depuis le site : ces demandes sont traitées à la main par l'équipe du projet (voir les
        <RouterLink :to="{ name: 'mentions-legales' }">mentions légales</RouterLink>).
      </p>
    </section>
  </article>
</template>
