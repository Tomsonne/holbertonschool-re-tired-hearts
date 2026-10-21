import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountThrottlerGuard } from '../common/account-throttler.guard';
import { ConversationsController } from './conversations.controller';
import { ConversationParticipantGuard } from './conversation-participant.guard';
import { ConversationsService } from './conversations.service';

// AuthModule réexporte ThrottlerModule : le quota d'envoi s'appuie sur la même
// configuration que les autres routes limitées.
@Module({
  imports: [AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationParticipantGuard, AccountThrottlerGuard],
})
export class MessagingModule {}
