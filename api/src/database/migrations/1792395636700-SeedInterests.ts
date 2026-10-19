import { MigrationInterface, QueryRunner } from 'typeorm';

// Donnée de référence nécessaire au fonctionnement de l'application : les membres choisissent
// leurs centres d'intérêt dedans et chaque événement en désigne un comme thème principal.
// Les comptes, événements et messages de démonstration ne sont pas ici : ils viennent du
// script de seed (tâche 5).
const INTERESTS: Array<[slug: string, label: string]> = [
  ['marche', 'Marche et randonnée'],
  ['jardinage', 'Jardinage'],
  ['cuisine', 'Cuisine et gastronomie'],
  ['lecture', 'Lecture et clubs de lecture'],
  ['jeux-de-societe', 'Jeux de société et cartes'],
  ['danse', 'Danse'],
  ['musique', 'Musique et chant'],
  ['cinema-theatre', 'Cinéma et théâtre'],
  ['musees', 'Musées et patrimoine'],
  ['sorties-journee', 'Voyages et sorties à la journée'],
  ['benevolat', 'Bénévolat'],
  ['gym-douce', 'Gym douce (yoga, taï-chi)'],
  ['photographie', 'Photographie'],
  ['petanque', 'Pétanque'],
  ['arts-creatifs', 'Arts créatifs et bricolage'],
  ['langues', 'Langues et conversation'],
];

export class SeedInterests1792395636700 implements MigrationInterface {
  name = 'SeedInterests1792395636700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [slug, label] of INTERESTS) {
      await queryRunner.query(
        `INSERT INTO "interests" ("slug", "label") VALUES ($1, $2) ON CONFLICT ("slug") DO NOTHING`,
        [slug, label],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "interests" WHERE "slug" = ANY($1)`, [
      INTERESTS.map(([slug]) => slug),
    ]);
  }
}
