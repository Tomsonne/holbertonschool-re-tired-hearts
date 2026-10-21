import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequireAccess } from '../auth/auth.decorators';
import { CitiesService } from './cities.service';

class CitiesQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 100)
  q: string;
}

// Chaque appel non servi par le cache part vers geo.api.gouv.fr, qui limite à 10 requêtes
// par seconde et par IP — la nôtre, partagée par tous les comptes. Le cache ne protège
// pas d'une rafale de termes différents, d'où ce quota.
// 30 appels par tranche de 10 secondes : le formulaire n'appelle qu'après 300 ms de pause,
// donc une recherche hésitante reste très en dessous, tandis qu'un client emballé est borné
// à 3 appels par seconde. Fenêtre courte volontairement : une limite par minute laisserait
// passer la rafale entière dès la première seconde.
export const CITY_SEARCH_LIMIT = 30;
export const CITY_SEARCH_WINDOW_MS = 10_000;

// Le quota suit le compte connecté et non l'adresse IP : plusieurs membres derrière une
// même connexion ne se gênent pas. La route exige un compte actif ; le repli sur l'adresse
// ne sert qu'à ne jamais produire de clé vide.
const trackAccount = (request: Record<string, any>): string => {
  const user = (request as { user?: { id: string } }).user;
  return user ? `account:${user.id}` : `ip:${String(request.ip)}`;
};

@Controller('cities')
@RequireAccess('active')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: CITY_SEARCH_LIMIT, ttl: CITY_SEARCH_WINDOW_MS, getTracker: trackAccount } })
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  search(@Query() query: CitiesQueryDto) {
    return this.cities.search(query.q);
  }
}
