import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { User } from '../users/user.entity';
import { ConversationsService } from './conversations.service';

// Les gardes précèdent les pipes de validation Nest : aucun contenu de message ne doit
// être validé avant que la conversation soit reconnue comme appartenant à l'auteur.
@Injectable()
export class ConversationParticipantGuard implements CanActivate {
  constructor(private readonly conversations: ConversationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: User; params: { id?: string } }>();
    const id = request.params.id;
    if (id && isUUID(id) && request.user) {
      await this.conversations.assertParticipant(request.user.id, id);
    }
    return true;
  }
}
