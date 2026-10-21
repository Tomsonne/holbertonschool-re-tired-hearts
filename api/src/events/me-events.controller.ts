import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { MyRegistrationsFiltersDto, OrganizedEventsFiltersDto } from './event-filters.dto';
import { EventsService } from './events.service';

// Les deux listes personnelles du membre : ce qu'il organise et ce à quoi il participe.
// GET /events ne rend que le publié et à venir, elles sont le seul accès au reste.
@Controller('me')
export class MeEventsController {
  constructor(private readonly events: EventsService) {}

  @Get('organized-events')
  @RequireAccess('organizer')
  organizedEvents(@CurrentUser() user: User, @Query() filters: OrganizedEventsFiltersDto) {
    return this.events.listOrganized(user.id, filters);
  }

  @Get('registrations')
  @RequireAccess('active')
  registrations(@CurrentUser() user: User, @Query() filters: MyRegistrationsFiltersDto) {
    return this.events.listMyRegistrations(user.id, filters.scope ?? 'upcoming');
  }
}
