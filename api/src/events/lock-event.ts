import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Event } from './event.entity';

export async function lockEvent(manager: EntityManager, id: string): Promise<Event> {
  const event = await manager.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } });
  if (!event) {
    throw new AppException(HttpStatus.NOT_FOUND, 'EVENT_NOT_FOUND', "Cette sortie n'est pas disponible.");
  }
  return event;
}
