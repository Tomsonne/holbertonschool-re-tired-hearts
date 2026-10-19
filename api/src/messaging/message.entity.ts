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
import { User } from '../users/user.entity';
import { Conversation } from './conversation.entity';

export const MESSAGE_MAX_LENGTH = 1000;

@Entity({ name: 'messages' })
@Index('idx_messages_conversation_id_created_at', ['conversationId', 'createdAt'])
// R-MSG-6 : de 1 à 1000 caractères après nettoyage des espaces, règle répétée côté base.
@Check('chk_messages_body_length', `char_length(btrim("body")) BETWEEN 1 AND 1000`)
export class Message {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_messages' })
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'conversation_id', foreignKeyConstraintName: 'fk_messages_conversation_id' })
  conversation: Conversation;

  // R-MSG-5 : toujours l'utilisateur authentifié, jamais une valeur du corps de la requête.
  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'sender_id', foreignKeyConstraintName: 'fk_messages_sender_id' })
  sender: User;

  // Texte brut : affiché par interpolation, jamais avec v-html.
  @Column({ type: 'varchar', length: 1000 })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
