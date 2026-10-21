import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationParticipantGuard } from './conversation-participant.guard';
import { ConversationsService } from './conversations.service';

@Module({ controllers: [ConversationsController], providers: [ConversationsService, ConversationParticipantGuard] })
export class MessagingModule {}
