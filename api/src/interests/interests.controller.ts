import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InterestDto } from './interest.dto';
import { InterestsService } from './interests.service';

// Donnée de référence publique : alimente l'accueil, le formulaire de profil
// et les filtres d'événements. Aucune donnée personnelle.
@ApiTags('centres d\'intérêt')
@Controller('interests')
export class InterestsController {
  constructor(private readonly interestsService: InterestsService) {}

  @Get()
  @ApiOkResponse({ type: InterestDto, isArray: true, description: 'Triés par libellé' })
  findAll(): Promise<InterestDto[]> {
    return this.interestsService.findAll();
  }
}
