import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Event } from '../events/event.entity';
import { User } from '../users/user.entity';

// R-MSG-2 : deux participants distincts stockés comme paire ordonnée, donc (A, B) et (B, A)
// désignent la même conversation et la contrainte unique empêche les doublons.
@Entity({ name: 'conversations' })
@Unique('uq_conversations_pair', ['participantAId', 'participantBId'])
@Index('idx_conversations_participant_b_id', ['participantBId'])
@Check('chk_conversations_distinct_ordered', `"participant_a_id" < "participant_b_id"`)
export class Conversation {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_conversations' })
  id: string;

  @Column({ name: 'participant_a_id', type: 'uuid' })
  participantAId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'participant_a_id',
    foreignKeyConstraintName: 'fk_conversations_participant_a_id',
  })
  participantA: User;

  @Column({ name: 'participant_b_id', type: 'uuid' })
  participantBId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'participant_b_id',
    foreignKeyConstraintName: 'fk_conversations_participant_b_id',
  })
  participantB: User;

  // Événement qui a rendu le contact possible, affiché comme contexte dans la boîte de réception.
  @Column({ name: 'context_event_id', type: 'uuid', nullable: true })
  contextEventId: string | null;

  @ManyToOne(() => Event, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'context_event_id',
    foreignKeyConstraintName: 'fk_conversations_context_event_id',
  })
  contextEvent: Event | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
