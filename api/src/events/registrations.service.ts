import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/app.exception';
import { Profile, ProfileStatus } from '../profiles/profile.entity';
import { AccountStatus, User } from '../users/user.entity';
import { EventRegistration, RegistrationStatus } from './event-registration.entity';
import { Event, EventStatus } from './event.entity';

@Injectable()
export class RegistrationsService {
  constructor(private readonly db: DataSource) {}

  private async requireApproved(manager: EntityManager, actorId: string): Promise<void> {
    const user = await manager.findOneBy(User, { id: actorId });
    if (!user || user.status !== AccountStatus.Active) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Ce compte ne peut pas participer à une sortie.');
    }
    const profile = await manager.findOneBy(Profile, { userId: actorId });
    if (!profile || profile.status !== ProfileStatus.Approved) {
      throw new AppException(HttpStatus.FORBIDDEN, 'PROFILE_NOT_APPROVED', 'Votre profil doit être approuvé pour participer.');
    }
  }

  // Le même verrou est utilisé par EventsService.update lors d'un changement de capacité.
  private async lockedEvent(manager: EntityManager, eventId: string): Promise<Event> {
    const event = await manager.findOne(Event, {
      where: { id: eventId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!event) {
      throw new AppException(HttpStatus.NOT_FOUND, 'EVENT_NOT_FOUND', "Cette sortie n'est pas disponible.");
    }
    return event;
  }

  async register(actorId: string, eventId: string): Promise<{ status: RegistrationStatus.Registered; availablePlaces: number }> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      await this.requireApproved(manager, actorId);
      const event = await this.lockedEvent(manager, eventId);
      if (event.organizerId === actorId) {
        throw new AppException(HttpStatus.FORBIDDEN, 'OWN_EVENT', 'Vous ne pouvez pas vous inscrire à votre propre sortie.');
      }
      if (event.status !== EventStatus.Published || event.startsAt <= new Date()) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_NOT_OPEN', "Cette sortie ne prend plus d'inscriptions.");
      }
      const existing = await manager.findOneBy(EventRegistration, { eventId, userId: actorId });
      if (existing?.status === RegistrationStatus.Registered) {
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_REGISTERED', 'Vous êtes déjà inscrit à cette sortie.');
      }
      const registeredCount = await manager.countBy(EventRegistration, {
        eventId,
        status: RegistrationStatus.Registered,
      });
      if (registeredCount >= event.capacity) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_FULL', 'Cette sortie est complète.');
      }
      if (existing) {
        existing.status = RegistrationStatus.Registered;
        existing.registeredAt = new Date();
        existing.withdrawnAt = null;
        await manager.save(existing);
      } else {
        await manager.save(manager.create(EventRegistration, {
          eventId,
          userId: actorId,
          status: RegistrationStatus.Registered,
        }));
      }
      return { status: RegistrationStatus.Registered, availablePlaces: event.capacity - registeredCount - 1 };
    });
  }

  async withdraw(actorId: string, eventId: string): Promise<{ status: RegistrationStatus.Withdrawn; availablePlaces: number }> {
    return this.db.transaction('READ COMMITTED', async (manager) => {
      await this.requireApproved(manager, actorId);
      const event = await this.lockedEvent(manager, eventId);
      if (event.startsAt <= new Date()) {
        throw new AppException(HttpStatus.CONFLICT, 'EVENT_NOT_OPEN', 'Cette sortie a déjà commencé.');
      }
      const existing = await manager.findOneBy(EventRegistration, {
        eventId,
        userId: actorId,
        status: RegistrationStatus.Registered,
      });
      if (!existing) {
        throw new AppException(HttpStatus.NOT_FOUND, 'NOT_REGISTERED', "Vous n'êtes pas inscrit à cette sortie.");
      }
      existing.status = RegistrationStatus.Withdrawn;
      existing.withdrawnAt = new Date();
      await manager.save(existing);
      const registeredCount = await manager.countBy(EventRegistration, {
        eventId,
        status: RegistrationStatus.Registered,
      });
      return { status: RegistrationStatus.Withdrawn, availablePlaces: event.capacity - registeredCount };
    });
  }
}
