import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  Member = 'member',
  Organizer = 'organizer',
  Moderator = 'moderator',
}

export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended',
}

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('chk_users_email_lowercase', `"email" = lower("email")`)
@Check('chk_users_suspension', `("status" = 'suspended') = ("suspended_at" IS NOT NULL)`)
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  // Jamais sélectionné par défaut : le hachage doit être demandé explicitement (R-AUTH-1).
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  // R-ROLE-1 : tout nouveau compte est un membre.
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', default: UserRole.Member })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.Active,
  })
  status: AccountStatus;

  // R-AUTH-3 : incrémenté pour invalider tous les jetons déjà émis.
  @Column({ name: 'session_version', type: 'integer', default: 0 })
  sessionVersion: number;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
