import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MeEventsController } from './me-events.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  controllers: [EventsController, MeEventsController],
  providers: [EventsService, RegistrationsService],
  exports: [EventsService, RegistrationsService],
})
export class EventsModule {}
