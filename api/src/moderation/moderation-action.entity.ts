import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';

export enum ModerationActionType {
  ApproveProfile = 'approve_profile',
  BlockProfile = 'block_profile',
  UnblockProfile = 'unblock_profile',
  SuspendAccount = 'suspend_account',
  ReactivateAccount = 'reactivate_account',
  CancelEvent = 'cancel_event',
  GrantOrganizer = 'grant_organizer',
  RevokeOrganizer = 'revoke_organizer',
}

// R-MOD-1 : journal en ajout seul, écrit dans la même transaction que le changement d'état.
// Il ne contient jamais de mot de passe ni de contenu de message.
@Entity({ name: 'moderation_actions' })
@Index('idx_moderation_actions_created_at', ['createdAt'])
@Index('idx_moderation_actions_target_user_id', ['targetUserId'])
@Index('idx_moderation_actions_target_event_id', ['targetEventId'])
@Check('chk_moderation_actions_single_target', `num_nonnulls("target_user_id", "target_event_id") = 1`)
export class ModerationAction {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_moderation_actions' })
  id: string;

  @Column({ name: 'moderator_id', type: 'uuid' })
  moderatorId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'moderator_id',
    foreignKeyConstraintName: 'fk_moderation_actions_moderator_id',
  })
  moderator: User;

  @Column({ type: 'enum', enum: ModerationActionType, enumName: 'moderation_action_type' })
  action: ModerationActionType;

  // Exactement une cible : un compte ou un événement.
  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'target_user_id',
    foreignKeyConstraintName: 'fk_moderation_actions_target_user_id',
  })
  targetUser: User | null;

  @Column({ name: 'target_event_id', type: 'uuid', nullable: true })
  targetEventId: string | null;

  @ManyToOne(() => Event, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'target_event_id',
    foreignKeyConstraintName: 'fk_moderation_actions_target_event_id',
  })
  targetEvent: Event | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
