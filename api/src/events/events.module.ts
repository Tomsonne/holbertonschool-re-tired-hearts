import { Module } from '@nestjs/common';
import { EventsController, EventSessionGuard } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventSessionGuard],
  exports: [EventsService],
})
export class EventsModule {}
