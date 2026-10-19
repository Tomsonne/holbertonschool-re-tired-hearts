import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

// Donnée de référence, alimentée par la migration SeedInterests.
// Les membres choisissent dans cette liste, ils n'y ajoutent rien.
@Entity({ name: 'interests' })
@Unique('uq_interests_slug', ['slug'])
@Unique('uq_interests_label', ['label'])
export class Interest {
  @PrimaryGeneratedColumn('identity', {
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_interests',
  })
  id: number;

  @Column({ type: 'varchar', length: 50 })
  slug: string;

  @Column({ type: 'varchar', length: 80 })
  label: string;
}
