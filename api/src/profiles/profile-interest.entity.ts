import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Interest } from '../interests/interest.entity';
import { Profile } from './profile.entity';

// Table de jonction profils ↔ centres d'intérêt (N:M), clé primaire composite.
@Entity({ name: 'profile_interests' })
@Index('idx_profile_interests_interest_id', ['interestId'])
export class ProfileInterest {
  @PrimaryColumn({
    name: 'profile_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_profile_interests',
  })
  profileId: string;

  @PrimaryColumn({
    name: 'interest_id',
    type: 'integer',
    primaryKeyConstraintName: 'pk_profile_interests',
  })
  interestId: number;

  @ManyToOne(() => Profile, (profile) => profile.profileInterests, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'profile_id',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'fk_profile_interests_profile_id',
  })
  profile: Profile;

  @ManyToOne(() => Interest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'interest_id', foreignKeyConstraintName: 'fk_profile_interests_interest_id' })
  interest: Interest;
}
