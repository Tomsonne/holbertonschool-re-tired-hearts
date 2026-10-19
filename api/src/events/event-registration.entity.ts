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
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from './event.entity';

export enum RegistrationStatus {
  Registered = 'registered',
  Withdrawn = 'withdrawn',
}

// R-REG-1 : une seule ligne par (événement, membre). Se désinscrire met à jour cette ligne,
// se réinscrire la réactive. Seules les lignes « registered » comptent dans la capacité.
@Entity({ name: 'event_registrations' })
@Unique('uq_event_registrations_event_user', ['eventId', 'userId'])
@Index('idx_event_registrations_user_id', ['userId'])
@Check('chk_event_registrations_withdrawal', `("status" = 'withdrawn') = ("withdrawn_at" IS NOT NULL)`)
export class EventRegistration {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_event_registrations' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'event_id', foreignKeyConstraintName: 'fk_event_registrations_event_id' })
  event: Event;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_event_registrations_user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: RegistrationStatus,
    enumName: 'registration_status',
    default: RegistrationStatus.Registered,
  })
  status: RegistrationStatus;

  @CreateDateColumn({ name: 'registered_at', type: 'timestamptz' })
  registeredAt: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
