import {
  Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpCode, HttpStatus,
  Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Request } from 'express';
import { AppException } from '../common/app.exception';
import { EventInputDto, UpdateEventDto } from './event-input.dto';
import { EventFiltersDto } from './event-filters.dto';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

type AuthenticatedRequest = Request & { user?: { id: string } };

// La garde JWT globale de la tâche 1 remplira request.user. Tant qu'elle n'existe pas,
// aucune route d'événement ne peut être appelée sans authentification.
@Injectable()
export class EventSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.id) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Merci de vous connecter pour continuer.');
    }
    return true;
  }
}

class CancelEventDto {
  @IsString()
  @Length(5, 300)
  reason: string;
}

@Controller('events')
@UseGuards(EventSessionGuard)
export class EventsController {
  constructor(private readonly events: EventsService, private readonly registrations: RegistrationsService) {}

  private userId(request: AuthenticatedRequest): string {
    return request.user!.id;
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() filters: EventFiltersDto) {
    return this.events.listPublished(this.userId(request), filters);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() input: EventInputDto) {
    const event = await this.events.create(this.userId(request), input);
    return this.events.detail(this.userId(request), event.id);
  }

  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.detail(this.userId(request), id);
  }

  @Patch(':id')
  async update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateEventDto) {
    await this.events.update(this.userId(request), id, input);
    return this.events.detail(this.userId(request), id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.events.publish(this.userId(request), id);
    return this.events.detail(this.userId(request), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: CancelEventDto) {
    await this.events.cancel(this.userId(request), id, input.reason);
    return this.events.detail(this.userId(request), id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.events.complete(this.userId(request), id);
    return this.events.detail(this.userId(request), id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.events.remove(this.userId(request), id);
  }

  @Post(':id/registration')
  register(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.registrations.register(this.userId(request), id);
  }

  @Delete(':id/registration')
  @HttpCode(200)
  withdraw(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.registrations.withdraw(this.userId(request), id);
  }
}
