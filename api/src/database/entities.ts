import { EventRegistration } from '../events/event-registration.entity';
import { Event } from '../events/event.entity';
import { Interest } from '../interests/interest.entity';
import { Conversation } from '../messaging/conversation.entity';
import { Message } from '../messaging/message.entity';
import { ModerationAction } from '../moderation/moderation-action.entity';
import { ProfileInterest } from '../profiles/profile-interest.entity';
import { Profile } from '../profiles/profile.entity';
import { User } from '../users/user.entity';

// Les neuf entités du modèle (docs/modele-donnees.md). Toute nouvelle entité s'ajoute ici.
export const ENTITIES = [
  User,
  Profile,
  Interest,
  ProfileInterest,
  Event,
  EventRegistration,
  Conversation,
  Message,
  ModerationAction,
];
