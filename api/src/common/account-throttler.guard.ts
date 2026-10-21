import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { User } from '../users/user.entity';

// Quota rattaché au compte connecté et non à l'adresse IP : plusieurs comptes derrière
// une même connexion ne se gênent pas, et changer d'adresse ne remet pas le compteur à
// zéro. Sans session, on retombe sur l'adresse normalisée de @nestjs/throttler.
// La clé du compteur reste propre à la route (ThrottlerGuard.generateKey).
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    const user = (request as { user?: User }).user;
    return user ? `account:${user.id}` : `ip:${await super.getTracker(request)}`;
  }
}
