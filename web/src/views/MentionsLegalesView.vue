<script setup lang="ts">
// Mentions légales (mission 26). Projet pédagogique : aucune entreprise, aucun hébergement public.
// Les informations qu'exigerait une vraie mise en ligne (éditeur, hébergeur, contact) sont signalées
// comme telles au lieu d'être inventées.
</script>

<template>
  <article class="page-texte" aria-labelledby="titre-mentions">
    <h2 id="titre-mentions" class="titre-orne">Mentions légales</h2>

    <p class="message message--info page-texte__chapo">
      Re-Tired Hearts est un <strong>projet d'étudiants</strong>, réalisé pour apprendre. Ce n'est pas un service
      ouvert au public : les comptes et les sorties que vous y voyez sont <strong>fictifs</strong>.
    </p>

    <section aria-labelledby="titre-editeur">
      <h3 id="titre-editeur">Qui a réalisé ce site ?</h3>
      <p>
        Une équipe de trois étudiants de <strong>Holberton School Toulouse</strong>, dans le cadre de leur formation
        de développeur web, pour le projet « Happy Retired ».
      </p>
    </section>

    <section aria-labelledby="titre-hebergement">
      <h3 id="titre-hebergement">Où le site est-il hébergé ?</h3>
      <p>
        Nulle part sur internet : l'application fonctionne sur l'ordinateur de l'équipe, le temps des démonstrations.
        Une vraie mise en ligne demanderait d'indiquer ici le nom et l'adresse de l'hébergeur.
      </p>
    </section>

    <section aria-labelledby="titre-donnees">
      <h3 id="titre-donnees">Vos données personnelles</h3>
      <p>
        Ce que les autres membres voient, ce qui reste privé et ce que fait la modération sont expliqués sur la page <RouterLink :to="{ name: 'vie-privee' }">Vos données et votre vie privée</RouterLink>.
      </p>
      <p>
        Pour changer d'adresse e-mail, supprimer votre compte ou obtenir une copie de vos données, adressez-vous à
        l'équipe du projet : ces demandes sont traitées à la main. Une vraie mise en ligne demanderait d'indiquer ici
        une adresse de contact et la personne responsable de vos données.
      </p>
    </section>

    <section aria-labelledby="titre-credits">
      <h3 id="titre-credits">Polices de caractères</h3>
      <p>
        Les polices Federo, Lora et Playfair Display sont publiées sous licence libre (SIL Open Font License 1.1). Elles
        sont fournies par le site lui-même : afficher une page ne contacte aucun service extérieur.
      </p>
      <ul>
        <li>Federo : Olexa M. Volochay (Cyreal)</li>
        <li>Lora : Cyreal</li>
        <li>Playfair Display : Claus Eggers Sørensen</li>
      </ul>
    </section>
  </article>
</template>
