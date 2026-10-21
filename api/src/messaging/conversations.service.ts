import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/app.exception';
import { AccountStatus, User, UserRole } from '../users/user.entity';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { Conversation } from './conversation.entity';

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
}
