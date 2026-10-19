import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ProfileInterest } from './profile-interest.entity';

export enum ProfileStatus {
  Pending = 'pending',
  Approved = 'approved',
  Blocked = 'blocked',
}

export const LOOKING_FOR_VALUES = ['friendship', 'companionship', 'romance', 'activities'] as const;
export type LookingFor = (typeof LOOKING_FOR_VALUES)[number];

@Entity({ name: 'profiles' })
@Index('idx_profiles_discovery', ['status', 'departmentCode'])
@Check('chk_profiles_display_name_length', `char_length(btrim("display_name")) BETWEEN 2 AND 40`)
@Check(
  'chk_profiles_looking_for',
  `"looking_for" <@ ARRAY['friendship', 'companionship', 'romance', 'activities']::varchar[]`,
)
@Check('chk_profiles_postal_code', `"postal_code" IS NULL OR "postal_code" ~ '^[0-9]{5}$'`)
// R-PROF-2 : un profil approuvé a toujours une localisation approximative.
@Check(
  'chk_profiles_location_when_approved',
  `"status" <> 'approved' OR ("city_name" IS NOT NULL AND "department_code" IS NOT NULL)`,
)
export class Profile {
  // Clé primaire partagée avec users : un seul profil par compte (1:1).
  @PrimaryColumn({ name: 'user_id', type: 'uuid', primaryKeyConstraintName: 'pk_profiles' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_profiles_user_id' })
  user: User;

  @Column({ name: 'display_name', type: 'varchar', length: 40 })
  displayName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string | null;

  @Column({ name: 'looking_for', type: 'varchar', length: 20, array: true, default: () => "'{}'" })
  lookingFor: LookingFor[];

  // Localisation approximative visible des membres (R-LOC-2).
  @Column({ name: 'city_name', type: 'varchar', length: 100, nullable: true })
  cityName: string | null;

  @Column({ name: 'department_code', type: 'varchar', length: 3, nullable: true })
  departmentCode: string | null;

  // Privé : propriétaire et modérateurs uniquement.
  @Column({ name: 'postal_code', type: 'varchar', length: 5, nullable: true })
  postalCode: string | null;

  @Column({ name: 'city_code', type: 'varchar', length: 5, nullable: true })
  cityCode: string | null;

  // false quand la ville a été saisie à la main (API externe indisponible, R-LOC-3).
  @Column({ name: 'location_verified', type: 'boolean', default: false })
  locationVerified: boolean;

  @Column({ type: 'boolean', default: true })
  discoverable: boolean;

  @Column({ name: 'allow_messages', type: 'boolean', default: true })
  allowMessages: boolean;

  // R-PROF-1 : un nouveau profil attend l'approbation d'un modérateur.
  @Column({
    type: 'enum',
    enum: ProfileStatus,
    enumName: 'profile_status',
    default: ProfileStatus.Pending,
  })
  status: ProfileStatus;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ProfileInterest, (profileInterest) => profileInterest.profile)
  profileInterests: ProfileInterest[];
}
