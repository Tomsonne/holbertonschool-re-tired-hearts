import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Interest } from '../interests/interest.entity';
import { User } from '../users/user.entity';

export enum EventStatus {
  Draft = 'draft',
  Published = 'published',
  Cancelled = 'cancelled',
  Completed = 'completed',
}

export const EVENT_MIN_CAPACITY = 1;
export const EVENT_MAX_CAPACITY = 50;

@Entity({ name: 'events' })
@Index('idx_events_status_starts_at', ['status', 'startsAt'])
@Index('idx_events_interest_id', ['interestId'])
@Index('idx_events_organizer_id', ['organizerId'])
@Index('idx_events_city_code', ['cityCode'])
@Index('idx_events_department_code', ['departmentCode'])
@Check('chk_events_dates', `"ends_at" > "starts_at"`)
@Check('chk_events_capacity', `"capacity" BETWEEN 1 AND 50`)
@Check('chk_events_postal_code', `"postal_code" ~ '^[0-9]{5}$'`)
@Check(
  'chk_events_cancellation',
  `("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)`,
)
@Check('chk_events_completion', `("status" = 'completed') = ("completed_at" IS NOT NULL)`)
export class Event {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_events' })
  id: string;

  // R-EVT-7 : la propriété est vérifiée dans le service à chaque écriture.
  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'organizer_id', foreignKeyConstraintName: 'fk_events_organizer_id' })
  organizer: User;

  // R-EVT-1 : un seul centre d'intérêt principal, qui sert au filtrage.
  @Column({ name: 'interest_id', type: 'integer' })
  interestId: number;

  @ManyToOne(() => Interest, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'interest_id', foreignKeyConstraintName: 'fk_events_interest_id' })
  interest: Interest;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 2000 })
  description: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  // Localisation approximative, visible des membres.
  @Column({ name: 'city_name', type: 'varchar', length: 100 })
  cityName: string;

  @Column({ name: 'department_code', type: 'varchar', length: 3 })
  departmentCode: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 5 })
  postalCode: string;

  @Column({ name: 'city_code', type: 'varchar', length: 5, nullable: true })
  cityCode: string | null;

  @Column({ name: 'location_verified', type: 'boolean', default: false })
  locationVerified: boolean;

  // Repère public, par exemple « près du parc de la Tête d'Or ».
  @Column({ name: 'area_hint', type: 'varchar', length: 120, nullable: true })
  areaHint: string | null;

  // R-LOC-4 : renvoyée uniquement à l'organisateur, aux inscrits et aux modérateurs.
  @Column({ name: 'exact_address', type: 'varchar', length: 200 })
  exactAddress: string;

  // R-EVT-3 : de 1 à 50 participants, organisateur non compris.
  @Column({ type: 'smallint' })
  capacity: number;

  @Column({ type: 'enum', enum: EventStatus, enumName: 'event_status', default: EventStatus.Draft })
  status: EventStatus;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 300, nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
