import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, RegistrationsService],
  exports: [EventsService, RegistrationsService],
})
export class EventsModule {}
