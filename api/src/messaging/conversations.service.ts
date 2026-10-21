import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/app.exception';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { Conversation } from './conversation.entity';
import { Message, MESSAGE_MAX_LENGTH } from './message.entity';

@Injectable()
export class ConversationsService {
  constructor(private readonly db: DataSource) {}

  async start(actorId: string, recipientId: string, eventId?: string): Promise<{ conversation: object; created: boolean }> {
    if (actorId === recipientId) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Vous ne pouvez pas vous écrire à vous-même.');
    }

    const [actor, actorProfile, recipient, recipientProfile] = await Promise.all([
      this.db.manager.findOneBy(User, { id: actorId }),
      this.db.manager.findOneBy(Profile, { userId: actorId }),
      this.db.manager.findOneBy(User, { id: recipientId }),
      this.db.manager.findOneBy(Profile, { userId: recipientId }),
    ]);
    if (!actor || actor.status !== AccountStatus.Active) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Ce compte ne peut pas utiliser la messagerie.');
    }
    if (!actorProfile || actorProfile.status !== ProfileStatus.Approved) {
      throw new AppException(HttpStatus.FORBIDDEN, 'PROFILE_NOT_APPROVED', 'Votre profil doit être approuvé pour écrire.');
    }
    if (!recipient || recipient.status !== AccountStatus.Active ||
        !recipientProfile || recipientProfile.status !== ProfileStatus.Approved) {
      throw new AppException(HttpStatus.NOT_FOUND, 'PROFILE_UNAVAILABLE', 'Ce membre est indisponible.');
    }
    if (!actorProfile.allowMessages || !recipientProfile.allowMessages) {
      throw new AppException(HttpStatus.CONFLICT, 'MESSAGING_DISABLED', 'Les messages privés ne sont pas acceptés.');
    }

    const [participantAId, participantBId] = [actorId, recipientId].sort();
    let conversation = await this.db.manager.findOneBy(Conversation, { participantAId, participantBId });
    if (conversation) {
      return { conversation: await this.present(conversation, recipient, recipientProfile), created: false };
    }

    // Le contexte demandé doit lui-même justifier le contact. Sans contexte, n'importe
    // quel événement admissible suffit ; les inscriptions retirées sont exclues.
    const eligible: { id: string }[] = await this.db.query(`
      SELECT e.id FROM events e
      WHERE e.status <> 'draft'
        AND ($3::uuid IS NULL OR e.id = $3::uuid)
        AND (
          (e.organizer_id = $1 AND EXISTS (
            SELECT 1 FROM event_registrations r
            WHERE r.event_id = e.id AND r.user_id = $2 AND r.status = 'registered'
          ))
          OR (e.organizer_id = $2 AND EXISTS (
            SELECT 1 FROM event_registrations r
            WHERE r.event_id = e.id AND r.user_id = $1 AND r.status = 'registered'
          ))
          OR (
            EXISTS (SELECT 1 FROM event_registrations r
              WHERE r.event_id = e.id AND r.user_id = $1 AND r.status = 'registered')
            AND EXISTS (SELECT 1 FROM event_registrations r
              WHERE r.event_id = e.id AND r.user_id = $2 AND r.status = 'registered')
          )
        )
      ORDER BY e.starts_at DESC, e.id
      LIMIT 1
    `, [actorId, recipientId, eventId ?? null]);
    if (!eligible.length) {
      throw new AppException(HttpStatus.FORBIDDEN, 'NOT_ELIGIBLE', 'Aucune sortie commune ne permet ce contact.');
    }

    // ON CONFLICT couvre deux demandes simultanées, dans les deux sens.
    const inserted: { id: string }[] = await this.db.query(`
      INSERT INTO conversations (participant_a_id, participant_b_id, context_event_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (participant_a_id, participant_b_id) DO NOTHING
      RETURNING id
    `, [participantAId, participantBId, eligible[0].id]);
    const created = inserted.length > 0;
    conversation = await this.db.manager.findOneByOrFail(Conversation, { participantAId, participantBId });
    return { conversation: await this.present(conversation, recipient, recipientProfile), created };
  }

  private async present(conversation: Conversation, other: User, profile: Profile): Promise<object> {
    const context = conversation.contextEventId
      ? await this.db.query('SELECT id, title FROM events WHERE id = $1', [conversation.contextEventId]) as { id: string; title: string }[]
      : [];
    return {
      id: conversation.id,
      otherParticipant: {
        userId: other.id,
        displayName: profile.displayName,
        isOrganizer: other.role === UserRole.Organizer,
        available: true,
      },
      contextEvent: context[0] ?? null,
      canSend: true,
      cannotSendReason: null,
      createdAt: conversation.createdAt,
    };
  }

  private async requireParticipant(manager: EntityManager, actorId: string, id: string): Promise<Conversation> {
    const conversation = await manager.findOneBy(Conversation, { id });
    if (!conversation || (conversation.participantAId !== actorId && conversation.participantBId !== actorId)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CONVERSATION_NOT_FOUND', 'Cette conversation est indisponible.');
    }
    return conversation;
  }

  async detail(actorId: string, id: string): Promise<object> {
    const conversation = await this.requireParticipant(this.db.manager, actorId, id);
    const otherId = conversation.participantAId === actorId ? conversation.participantBId : conversation.participantAId;
    const [actorProfile, other, otherProfile] = await Promise.all([
      this.db.manager.findOneBy(Profile, { userId: actorId }),
      this.db.manager.findOneByOrFail(User, { id: otherId }),
      this.db.manager.findOneByOrFail(Profile, { userId: otherId }),
    ]);
    const available = other.status === AccountStatus.Active && otherProfile.status === ProfileStatus.Approved;
    const canSend = actorProfile?.status === ProfileStatus.Approved && actorProfile.allowMessages &&
      available && otherProfile.allowMessages;
    const result = await this.present(conversation, other, otherProfile) as Record<string, unknown>;
    return {
      ...result,
      otherParticipant: {
        userId: otherId,
        displayName: available ? otherProfile.displayName : 'Membre indisponible',
        isOrganizer: other.role === UserRole.Organizer,
        available,
      },
      canSend: Boolean(canSend),
      cannotSendReason: canSend ? null : !available ? 'RECIPIENT_UNAVAILABLE'
        : !actorProfile?.allowMessages || !otherProfile.allowMessages ? 'MESSAGING_DISABLED' : 'PROFILE_NOT_APPROVED',
    };
  }

  async list(actorId: string): Promise<object[]> {
    const conversations = await this.db.manager.createQueryBuilder(Conversation, 'conversation')
      .where('conversation.participantAId = :actorId OR conversation.participantBId = :actorId', { actorId })
      .orderBy('COALESCE(conversation.lastMessageAt, conversation.createdAt)', 'DESC')
      .addOrderBy('conversation.id', 'DESC')
      .getMany();
    return Promise.all(conversations.map(async (conversation) => {
      const latest = await this.db.manager.findOne(Message, {
        where: { conversationId: conversation.id },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
      return {
        ...await this.detail(actorId, conversation.id),
        lastMessage: latest ? {
          body: latest.body,
          sentByMe: latest.senderId === actorId,
          createdAt: latest.createdAt,
        } : null,
      };
    }));
  }

  async messages(actorId: string, id: string, before?: string, limit = 50): Promise<object[]> {
    await this.requireParticipant(this.db.manager, actorId, id);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'La limite demandée est invalide.');
    }
    const rows: { id: string; body: string; sender_id: string; display_name: string;
      user_status: AccountStatus; profile_status: ProfileStatus; created_at: Date }[] = await this.db.query(`
      SELECT m.id, m.body, m.sender_id, m.created_at, p.display_name,
        u.status AS user_status, p.status AS profile_status
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      JOIN profiles p ON p.user_id = m.sender_id
      WHERE m.conversation_id = $1
        AND ($2::uuid IS NULL OR (m.created_at, m.id) < (
          SELECT cursor.created_at, cursor.id FROM messages cursor
          WHERE cursor.id = $2::uuid AND cursor.conversation_id = $1
        ))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3
    `, [id, before ?? null, limit]);
    return rows.reverse().map((row) => ({
      id: row.id,
      body: row.body,
      sentByMe: row.sender_id === actorId,
      senderDisplayName: row.user_status === AccountStatus.Active && row.profile_status === ProfileStatus.Approved
        ? row.display_name : 'Membre indisponible',
      createdAt: row.created_at,
    }));
  }

  async send(actorId: string, id: string, rawBody: string): Promise<object> {
    // La base répète la limite ; ce nettoyage précède la mesure et le stockage.
    const body = typeof rawBody === 'string' ? rawBody.replace(/\s+/gu, ' ').trim() : '';
    if (Array.from(body).length < 1 || Array.from(body).length > MESSAGE_MAX_LENGTH) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Le message doit contenir de 1 à 1000 caractères.');
    }
    return this.db.transaction(async (manager) => {
      const conversation = await this.requireParticipant(manager, actorId, id);
      const otherId = conversation.participantAId === actorId ? conversation.participantBId : conversation.participantAId;
      const actor = await manager.findOneBy(User, { id: actorId });
      const actorProfile = await manager.findOneBy(Profile, { userId: actorId });
      const other = await manager.findOneBy(User, { id: otherId });
      const otherProfile = await manager.findOneBy(Profile, { userId: otherId });
      if (!actor || actor.status !== AccountStatus.Active) {
        throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Ce compte ne peut pas envoyer de message.');
      }
      if (!actorProfile || actorProfile.status !== ProfileStatus.Approved) {
        throw new AppException(HttpStatus.FORBIDDEN, 'PROFILE_NOT_APPROVED', 'Votre profil doit être approuvé pour écrire.');
      }
      if (!other || other.status !== AccountStatus.Active ||
          !otherProfile || otherProfile.status !== ProfileStatus.Approved) {
        throw new AppException(HttpStatus.CONFLICT, 'RECIPIENT_UNAVAILABLE', 'Ce membre ne peut pas recevoir de message.');
      }
      if (!actorProfile.allowMessages || !otherProfile.allowMessages) {
        throw new AppException(HttpStatus.CONFLICT, 'MESSAGING_DISABLED', 'Les messages privés ne sont pas acceptés.');
      }
      const message = await manager.save(manager.create(Message, {
        conversationId: id, senderId: actorId, body,
      }));
      await manager.query(`
        UPDATE conversations
        SET last_message_at = GREATEST(COALESCE(last_message_at, $2::timestamptz), $2::timestamptz)
        WHERE id = $1
      `, [id, message.createdAt]);
      return {
        id: message.id,
        body: message.body,
        sentByMe: true,
        senderDisplayName: actorProfile.displayName,
        createdAt: message.createdAt,
      };
    });
  }
}
