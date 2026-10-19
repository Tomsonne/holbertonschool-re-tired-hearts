import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { CurrentUser, RequireAccess } from '../auth/auth.decorators';
import { User } from '../users/user.entity';
import { EventInputDto, UpdateEventDto } from './event-input.dto';
import { EventFiltersDto } from './event-filters.dto';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

class CancelEventDto {
  @IsString()
  @Length(5, 300)
  reason: string;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService, private readonly registrations: RegistrationsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() filters: EventFiltersDto) {
    return this.events.listPublished(user.id, filters);
  }

  @Post()
  @RequireAccess('organizer')
  async create(@CurrentUser() user: User, @Body() input: EventInputDto) {
    const event = await this.events.create(user.id, input);
    return this.events.detail(user.id, event.id);
  }

  @Get(':id')
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.detail(user.id, id);
  }

  @Get(':id/participants')
  participants(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.participants(user.id, id);
  }

  @Patch(':id')
  @RequireAccess('organizer')
  async update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateEventDto) {
    await this.events.update(user.id, id, input);
    return this.events.detail(user.id, id);
  }

  @Post(':id/publish')
  @RequireAccess('organizer')
  @HttpCode(200)
  async publish(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.events.publish(user.id, id);
    return this.events.detail(user.id, id);
  }

  @Post(':id/cancel')
  @RequireAccess('organizer')
  @HttpCode(200)
  async cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() input: CancelEventDto) {
    await this.events.cancel(user.id, id, input.reason);
    return this.events.detail(user.id, id);
  }

  @Post(':id/complete')
  @RequireAccess('organizer')
  @HttpCode(200)
  async complete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.events.complete(user.id, id);
    return this.events.detail(user.id, id);
  }

  @Delete(':id')
  @RequireAccess('organizer')
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.events.remove(user.id, id);
  }

  @Post(':id/registration')
  @RequireAccess('approved')
  register(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.registrations.register(user.id, id);
  }

  @Delete(':id/registration')
  @RequireAccess('approved')
  @HttpCode(200)
  withdraw(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.registrations.withdraw(user.id, id);
  }
}
